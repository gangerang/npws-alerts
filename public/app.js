// Global variables
let map;
let markersLayer;
let allAlerts = [];
let currentFilters = {
    category: '',
    time: 'current',
    search: ''
};

// API base URL
const API_BASE = window.location.origin;

// Category colors
const CATEGORY_COLORS = {
    'Closed parks': '#e74c3c',
    'Closed areas': '#e67e22',
    'Fire bans': '#f39c12',
    'Fires - Advice': '#d35400',
    'Safety alerts': '#c0392b',
    'Other incidents': '#8e44ad',
    'Other planned events': '#3498db',
    'default': '#95a5a6'
};

/**
 * Initialize the map
 */
function initMap() {
    // Create map centered on NSW
    map = L.map('map').setView([-32.5, 147.0], 7);

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 18,
    }).addTo(map);

    // Create layer for markers
    markersLayer = L.layerGroup().addTo(map);

    console.log('Map initialized');
}

/**
 * Fetch and load categories for filter
 */
async function loadCategories() {
    try {
        const response = await fetch(`${API_BASE}/api/alerts/categories`);
        const result = await response.json();

        if (result.success) {
            const select = document.getElementById('category-filter');
            result.data.forEach(category => {
                const option = document.createElement('option');
                option.value = category;
                option.textContent = category;
                select.appendChild(option);
            });
        }
    } catch (error) {
        console.error('Error loading categories:', error);
    }
}

/**
 * Fetch and display statistics
 */
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        const result = await response.json();

        if (result.success) {
            const statsDiv = document.getElementById('stats');
            const { alerts, reserves, lastSync } = result.data;

            statsDiv.innerHTML = `
                <span class="stat-item">📊 ${alerts} Alerts</span>
                <span class="stat-item">🏞️ ${reserves} Reserves</span>
                <span class="stat-item">🔄 Last Updated: ${new Date(lastSync).toLocaleDateString()}</span>
            `;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

/**
 * Fetch alerts with current filters
 */
async function loadAlerts() {
    try {
        // Build query parameters
        const params = new URLSearchParams();

        if (currentFilters.category) {
            params.append('category', currentFilters.category);
        }

        if (currentFilters.time !== 'all') {
            params.append('is_future', currentFilters.time === 'future' ? 'true' : 'false');
        }

        const response = await fetch(`${API_BASE}/api/alerts/with-reserves?${params.toString()}`);
        const result = await response.json();

        if (result.success) {
            allAlerts = result.data;

            // Apply search filter on client side
            if (currentFilters.search) {
                const searchLower = currentFilters.search.toLowerCase();
                allAlerts = allAlerts.filter(alert =>
                    alert.park_name.toLowerCase().includes(searchLower)
                );
            }

            displayAlerts(allAlerts);
            console.log(`Loaded ${allAlerts.length} alerts`);
        }
    } catch (error) {
        console.error('Error loading alerts:', error);
    }
}

/**
 * Display alerts on the map
 */
function displayAlerts(alerts) {
    // Clear existing markers
    markersLayer.clearLayers();

    // Group alerts by park to avoid duplicate markers
    const alertsByPark = {};
    alerts.forEach(alert => {
        if (!alertsByPark[alert.park_name]) {
            alertsByPark[alert.park_name] = [];
        }
        alertsByPark[alert.park_name].push(alert);
    });

    // Create markers for each park with alerts
    Object.entries(alertsByPark).forEach(([parkName, parkAlerts]) => {
        const firstAlert = parkAlerts[0];

        // Try to get coordinates from reserve data
        let lat, lon;

        // First try to get from geometry
        if (firstAlert.geometry && firstAlert.geometry.rings && firstAlert.geometry.rings.length > 0) {
            // Calculate centroid from polygon
            const coords = calculateCentroid(firstAlert.geometry.rings[0]);
            lon = coords[0];
            lat = coords[1];
        } else if (firstAlert.geometry && firstAlert.geometry.x && firstAlert.geometry.y) {
            // Point geometry
            lon = firstAlert.geometry.x;
            lat = firstAlert.geometry.y;
        }

        // If we have coordinates, create a marker
        if (lat && lon) {
            createMarker(lat, lon, parkName, parkAlerts);
        } else {
            console.warn(`No coordinates for ${parkName}`);
        }
    });

    console.log(`Displayed ${Object.keys(alertsByPark).length} park locations`);
}

/**
 * Calculate centroid from polygon coordinates
 */
function calculateCentroid(coords) {
    let sumX = 0, sumY = 0, count = coords.length;

    coords.forEach(coord => {
        sumX += coord[0];
        sumY += coord[1];
    });

    return [sumX / count, sumY / count];
}

/**
 * Create a marker for a park with alerts
 */
function createMarker(lat, lon, parkName, alerts) {
    // Determine marker color based on alert severity
    const hasClosedPark = alerts.some(a => a.park_closed);
    const hasFireBan = alerts.some(a => a.alert_category === 'Fire bans');
    const category = alerts[0].alert_category;

    let color = CATEGORY_COLORS[category] || CATEGORY_COLORS.default;

    if (hasClosedPark) {
        color = '#e74c3c'; // Red for closed parks
    } else if (hasFireBan) {
        color = '#f39c12'; // Orange for fire bans
    }

    // Create custom icon
    const icon = L.divIcon({
        className: 'custom-marker',
        html: `
            <div style="
                background-color: ${color};
                width: 30px;
                height: 30px;
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-weight: bold;
                font-size: 14px;
            ">${alerts.length}</div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    // Create marker
    const marker = L.marker([lat, lon], { icon }).addTo(markersLayer);

    // Create popup content
    const popupContent = createPopupContent(parkName, alerts);
    marker.bindPopup(popupContent);

    // Add click handler to marker
    marker.on('click', () => {
        // Show details panel for first alert
        showDetails(alerts[0]);
    });
}

/**
 * Create popup content for a park
 */
function createPopupContent(parkName, alerts) {
    const alertCount = alerts.length;
    const categories = [...new Set(alerts.map(a => a.alert_category))].join(', ');

    return `
        <div class="popup-content">
            <div class="popup-title">${parkName}</div>
            <div class="popup-park">${alertCount} alert${alertCount > 1 ? 's' : ''}</div>
            <div class="popup-category">${categories}</div>
            ${alerts.slice(0, 2).map(alert => `
                <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #eee;">
                    <strong>${alert.alert_title}</strong>
                </div>
            `).join('')}
            ${alertCount > 2 ? `<div style="margin-top: 0.5rem; color: #7f8c8d; font-size: 0.85rem;">... and ${alertCount - 2} more</div>` : ''}
            <button class="popup-btn" onclick="showDetails(${JSON.stringify(alerts[0]).replace(/"/g, '&quot;')})">
                View Details
            </button>
        </div>
    `;
}

/**
 * Show details panel for an alert
 */
function showDetails(alert) {
    const panel = document.getElementById('details-panel');
    const content = document.getElementById('details-content');

    // Parse dates
    const startDate = new Date(alert.start_date).toLocaleDateString();
    const endDate = alert.end_date ? new Date(alert.end_date).toLocaleDateString() : 'Ongoing';
    const lastReviewed = new Date(alert.last_reviewed).toLocaleDateString();

    // Determine status
    let statusBadge = '';
    if (alert.park_closed) {
        statusBadge = '<span class="status-badge status-closed">Park Closed</span>';
    } else if (alert.park_part_closed) {
        statusBadge = '<span class="status-badge status-part-closed">Partially Closed</span>';
    } else {
        statusBadge = '<span class="status-badge status-open">Open</span>';
    }

    content.innerHTML = `
        <div class="detail-header">
            <h2 class="detail-title">${alert.alert_title}</h2>
            <p class="detail-park">${alert.park_name}</p>
            <span class="detail-category">${alert.alert_category}</span>
            ${statusBadge}
        </div>

        <div class="detail-section">
            <h3>Description</h3>
            <div>${alert.alert_description || 'No description available'}</div>
        </div>

        <div class="detail-section">
            <h3>Details</h3>
            <div class="detail-grid">
                <div class="detail-label">Effective From:</div>
                <div class="detail-value">${startDate}</div>

                <div class="detail-label">Effective To:</div>
                <div class="detail-value">${endDate}</div>

                <div class="detail-label">Last Reviewed:</div>
                <div class="detail-value">${lastReviewed}</div>

                <div class="detail-label">Alert Type:</div>
                <div class="detail-value">${alert.is_future ? 'Future' : 'Current'}</div>
            </div>
        </div>

        ${alert.reserve_name ? `
            <div class="detail-section">
                <h3>Reserve Information</h3>
                <div class="detail-grid">
                    <div class="detail-label">Full Name:</div>
                    <div class="detail-value">${alert.reserve_name}</div>

                    <div class="detail-label">Short Name:</div>
                    <div class="detail-value">${alert.reserve_name_short || 'N/A'}</div>

                    <div class="detail-label">Type:</div>
                    <div class="detail-value">${alert.reserve_type || 'N/A'}</div>

                    <div class="detail-label">Area:</div>
                    <div class="detail-value">${alert.reserve_area ? (alert.reserve_area).toFixed(2) + ' ha' : 'N/A'}</div>
                </div>
            </div>
        ` : ''}
    `;

    // Show panel
    panel.classList.remove('hidden');
}

/**
 * Hide details panel
 */
function hideDetails() {
    const panel = document.getElementById('details-panel');
    panel.classList.add('hidden');
}

/**
 * Apply current filters
 */
function applyFilters() {
    currentFilters.category = document.getElementById('category-filter').value;
    currentFilters.time = document.getElementById('time-filter').value;
    currentFilters.search = document.getElementById('search-input').value;

    loadAlerts();
}

/**
 * Clear all filters
 */
function clearFilters() {
    document.getElementById('category-filter').value = '';
    document.getElementById('time-filter').value = 'current';
    document.getElementById('search-input').value = '';

    currentFilters = {
        category: '',
        time: 'current',
        search: ''
    };

    loadAlerts();
}

/**
 * Initialize the application
 */
async function init() {
    console.log('Initializing NPWS Alerts Map...');

    // Initialize map
    initMap();

    // Load data
    await Promise.all([
        loadCategories(),
        loadStats(),
        loadAlerts()
    ]);

    // Setup event listeners
    document.getElementById('apply-filters').addEventListener('click', applyFilters);
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    document.getElementById('close-details').addEventListener('click', hideDetails);

    // Allow Enter key to apply filters
    document.getElementById('search-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            applyFilters();
        }
    });

    console.log('Initialization complete');
}

// Make showDetails available globally for popup buttons
window.showDetails = showDetails;

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
