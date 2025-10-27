// Global variables
let map;
let markersLayer;
let boundariesLayer;
let allAlerts = [];
let arcgisServiceUrl = '';
let currentParkAlerts = []; // Current park's alerts for navigation
let currentAlertIndex = 0; // Current alert being viewed
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

    // Create layer for boundaries
    boundariesLayer = L.layerGroup().addTo(map);

    console.log('Map initialized');
}

/**
 * Load configuration from API
 */
async function loadConfig() {
    try {
        const response = await fetch(`${API_BASE}/api/config`);
        const result = await response.json();

        if (result.success) {
            arcgisServiceUrl = result.data.arcgisServiceUrl;
            console.log('Config loaded:', arcgisServiceUrl);
        }
    } catch (error) {
        console.error('Error loading config:', error);
    }
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

            // Format date and time
            const lastUpdated = new Date(lastSync);
            const dateStr = lastUpdated.toLocaleDateString();
            const timeStr = lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            statsDiv.innerHTML = `
                <span class="stat-item">📊 ${alerts} Alerts</span>
                <span class="stat-item">🏞️ ${reserves} Reserves</span>
                <span class="stat-item">🔄 Last Updated: ${dateStr} ${timeStr}</span>
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

            // Populate park autocomplete
            populateParkAutocomplete(allAlerts);

            // Apply search filter on client side
            let displayedAlerts = allAlerts;
            if (currentFilters.search) {
                const searchLower = currentFilters.search.toLowerCase();
                displayedAlerts = allAlerts.filter(alert =>
                    alert.park_name.toLowerCase().includes(searchLower)
                );
            }

            displayAlerts(displayedAlerts);
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

        // Get coordinates from centroid (directly from reserve data)
        const lat = firstAlert.centroid_lat;
        const lon = firstAlert.centroid_lon;

        // If we have coordinates, create a marker
        if (lat && lon) {
            createMarker(lat, lon, parkName, parkAlerts, firstAlert.reserve_object_id);
        } else {
            console.warn(`No coordinates for ${parkName} (no mapping to reserve)`);
        }
    });

    console.log(`Displayed ${Object.keys(alertsByPark).length} park locations`);

    // Load park boundaries for alerts with mapped reserves
    loadParkBoundaries(alerts);
}

/**
 * Load park boundaries from ArcGIS service
 */
function loadParkBoundaries(alerts) {
    // Clear existing boundaries
    boundariesLayer.clearLayers();

    if (!arcgisServiceUrl || !window.L.esri) {
        console.warn('ArcGIS service not configured or esri-leaflet not loaded');
        return;
    }

    // Get unique reserve object IDs from alerts that have mappings
    const reserveObjectIds = [...new Set(
        alerts
            .filter(alert => alert.reserve_object_id)
            .map(alert => alert.reserve_object_id)
    )];

    if (reserveObjectIds.length === 0) {
        console.log('No mapped reserves to display boundaries for');
        return;
    }

    console.log(`Loading boundaries for ${reserveObjectIds.length} reserves...`);

    // Extract base MapServer URL (remove /0 layer suffix)
    // arcgisServiceUrl is like: .../MapServer/0
    // We need: .../MapServer
    const baseMapServerUrl = arcgisServiceUrl.replace(/\/\d+$/, '');

    // Create definition expression to filter reserves
    const whereClause = `OBJECTID_1 IN (${reserveObjectIds.join(',')})`;

    // Define custom blue styling for the layer with filter
    const dynamicLayerDefinition = {
        id: 0,
        source: {
            type: 'mapLayer',
            mapLayerId: 0
        },
        definitionExpression: whereClause,  // Filter must be inside dynamicLayers
        drawingInfo: {
            renderer: {
                type: 'simple',
                symbol: {
                    type: 'esriSFS',  // Simple Fill Symbol
                    style: 'esriSFSSolid',
                    color: [51, 136, 255, 80],  // Blue RGBA (opacity ~30%)
                    outline: {
                        type: 'esriSLS',  // Simple Line Symbol
                        style: 'esriSLSSolid',
                        color: [51, 136, 255, 180],  // Blue outline (more opaque)
                        width: 2
                    }
                }
            }
        }
    };

    // Use dynamic map layer (raster tiles) instead of feature layer (vector)
    // This is much faster as the server pre-renders filtered features as tiles
    L.esri.dynamicMapLayer({
        url: baseMapServerUrl,
        opacity: 1.0,  // Opacity controlled by RGBA values in symbol
        layers: [0],   // Layer 0 is the reserves layer
        dynamicLayers: JSON.stringify([dynamicLayerDefinition])
    }).addTo(boundariesLayer);

    console.log(`Park boundaries loaded as raster tiles (${reserveObjectIds.length} reserves filtered)`);
}

/**
 * Setup filter toggle for mobile
 */
function setupFilterToggle() {
    const toggleBtn = document.getElementById('filter-toggle');
    const advancedFilters = document.getElementById('advanced-filters');

    if (!toggleBtn || !advancedFilters) {
        return; // Elements not found
    }

    // Start with advanced filters collapsed on mobile
    if (window.innerWidth <= 768) {
        advancedFilters.classList.add('collapsed');
    }

    toggleBtn.addEventListener('click', function() {
        advancedFilters.classList.toggle('collapsed');

        // Optional: animate the toggle button (rotate hamburger icon)
        toggleBtn.classList.toggle('active');
    });

    // Handle window resize - show advanced filters on desktop
    window.addEventListener('resize', function() {
        if (window.innerWidth > 768) {
            advancedFilters.classList.remove('collapsed');
        } else {
            // On mobile, keep collapsed state
            if (!advancedFilters.classList.contains('collapsed')) {
                // Only auto-collapse if user hasn't manually opened it
            }
        }
    });

    console.log('Filter toggle initialized');
}

/**
 * Setup click handler for park boundaries
 * Uses ArcGIS Identify service to make raster boundaries interactive
 */
function setupBoundaryClickHandler() {
    map.on('click', function(e) {
        // Only identify if we have boundaries loaded and ArcGIS service configured
        if (!arcgisServiceUrl || boundariesLayer.getLayers().length === 0) {
            return;
        }

        // Extract base MapServer URL
        const baseMapServerUrl = arcgisServiceUrl.replace(/\/\d+$/, '');

        // Use ArcGIS identify at the MapServer level, specifying layer 0
        L.esri.identifyFeatures({
            url: baseMapServerUrl
        })
        .on(map)
        .at(e.latlng)
        .layers('all:0')       // Query only layer 0
        .tolerance(5)          // 5 pixel tolerance for clicking
        .returnGeometry(false) // Don't return geometry, only attributes
        .run(function(error, featureCollection, response) {
            if (error) {
                console.error('Identify error:', error);
                return;
            }

            // Check response structure
            if (!featureCollection || !featureCollection.features || featureCollection.features.length === 0) {
                // No features found at click location
                return;
            }

            // Get the first feature found
            const feature = featureCollection.features[0];

            // Check if feature has the expected properties
            if (!feature.properties || !feature.properties.OBJECTID_1) {
                console.warn('Feature missing expected properties:', feature);
                return;
            }

            // Get objectId - ensure it's a number for consistent comparison
            const objectId = Number(feature.properties.OBJECTID_1);
            const parkName = feature.properties.NAME || 'Unknown Park';

            console.log(`Clicked park: ${parkName}, OBJECTID_1: ${objectId} (type: ${typeof objectId})`);

            // Find alerts for this reserve
            // Note: reserve_object_id might be number or string, so compare both as numbers
            const parkAlerts = allAlerts.filter(a => {
                const reserveId = Number(a.reserve_object_id);
                return reserveId === objectId;
            });

            console.log(`Found ${parkAlerts.length} alerts for park ${parkName} (ID: ${objectId})`);
            if (parkAlerts.length > 0) {
                console.log('Alert IDs:', parkAlerts.map(a => a.alert_id));
            }

            if (parkAlerts.length > 0) {
                // Create and show popup using same function as markers
                L.popup()
                    .setLatLng(e.latlng)
                    .setContent(createPopupContent(parkName, parkAlerts))
                    .openOn(map);
            }
        });
    });

    console.log('Boundary click handler initialized');
}

/**
 * Create a marker for a park with alerts
 */
function createMarker(lat, lon, parkName, alerts, reserveObjectId) {
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

    // Don't auto-open sidebar on marker click - let user choose from popup
    // The popup items will call showParkAlerts() when clicked
}

/**
 * Format date for alert display
 */
function formatAlertDate(dateString) {
    if (!dateString) return 'Ongoing';
    const date = new Date(dateString);
    const day = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    return `${day} ${month}`;
}

/**
 * Create popup content for a park
 */
function createPopupContent(parkName, alerts) {
    const alertCount = alerts.length;

    // Store alerts globally for access by click handlers
    const parkId = alerts[0].park_id;
    window[`alerts_${parkId}`] = alerts;

    // Sort alerts: first by category (alphabetically), then by start date
    const sortedAlerts = [...alerts].sort((a, b) => {
        // Primary sort: category
        const catCompare = a.alert_category.localeCompare(b.alert_category);
        if (catCompare !== 0) return catCompare;

        // Secondary sort: start date (earliest first)
        return new Date(a.start_date) - new Date(b.start_date);
    });

    return `
        <div class="popup-content">
            <div class="popup-title">${parkName}</div>
            <div class="popup-subtitle">${alertCount} alert${alertCount > 1 ? 's' : ''}</div>

            <div class="popup-alerts-list">
                ${sortedAlerts.map((alert, index) => {
                    const startDate = formatAlertDate(alert.start_date);
                    const endDate = formatAlertDate(alert.end_date);
                    const dateRange = `${startDate} - ${endDate}`;

                    return `
                        <div class="popup-alert-item" onclick="showParkAlerts('${parkId}', ${index})">
                            <div class="popup-alert-icon ${getAlertIconClass(alert)}">!</div>
                            <div class="popup-alert-content">
                                <div class="popup-alert-title">${alert.alert_title}</div>
                                <div class="popup-alert-category">${alert.alert_category} | ${dateRange}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

/**
 * Get icon class based on alert severity
 */
function getAlertIconClass(alert) {
    if (alert.park_closed) return 'alert-icon-closed';
    if (alert.park_part_closed) return 'alert-icon-warning';
    return 'alert-icon-info';
}

/**
 * Show park alerts with navigation
 */
function showParkAlerts(parkId, alertIndex = 0) {
    // Get alerts from global storage
    const alerts = window[`alerts_${parkId}`];
    if (!alerts || alerts.length === 0) return;

    // Store current state
    currentParkAlerts = alerts;
    currentAlertIndex = alertIndex;

    // Show the selected alert
    showAlertDetails(alertIndex);
}

/**
 * Navigate to previous alert
 */
function previousAlert() {
    if (currentAlertIndex > 0) {
        currentAlertIndex--;
        showAlertDetails(currentAlertIndex);
    }
}

/**
 * Navigate to next alert
 */
function nextAlert() {
    if (currentAlertIndex < currentParkAlerts.length - 1) {
        currentAlertIndex++;
        showAlertDetails(currentAlertIndex);
    }
}

/**
 * Show details for specific alert index
 */
function showAlertDetails(index) {
    const alert = currentParkAlerts[index];
    if (!alert) return;
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

    // Build navigation
    const hasMultipleAlerts = currentParkAlerts.length > 1;
    const alertCounter = hasMultipleAlerts ? `
        <div class="alert-navigation">
            <button class="nav-btn" onclick="previousAlert()" ${index === 0 ? 'disabled' : ''}>
                ‹
            </button>
            <span class="alert-counter">Alert ${index + 1} of ${currentParkAlerts.length}</span>
            <button class="nav-btn" onclick="nextAlert()" ${index === currentParkAlerts.length - 1 ? 'disabled' : ''}>
                ›
            </button>
        </div>
    ` : '';

    // Build alerts list for quick switching
    const alertsList = hasMultipleAlerts ? `
        <div class="detail-section">
            <h3>All Alerts for ${alert.park_name}</h3>
            <div class="sidebar-alerts-list">
                ${currentParkAlerts.map((a, i) => `
                    <div class="sidebar-alert-item ${i === index ? 'active' : ''}" onclick="showAlertDetails(${i})">
                        <div class="sidebar-alert-icon ${getAlertIconClass(a)}">!</div>
                        <div class="sidebar-alert-title">${a.alert_title}</div>
                    </div>
                `).join('')}
            </div>
        </div>
    ` : '';

    content.innerHTML = `
        ${alertCounter}

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

        ${alertsList}
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
 * Auto-apply category filter
 */
function onCategoryChange() {
    currentFilters.category = document.getElementById('category-filter').value;
    loadAlerts();
}

/**
 * Auto-apply time filter
 */
function onTimeChange() {
    currentFilters.time = document.getElementById('time-filter').value;
    loadAlerts();
}

/**
 * Debounced search handler for client-side filtering
 */
let searchDebounceTimer;
function onSearchInput() {
    const searchValue = document.getElementById('search-input').value;

    // Debounce search to avoid filtering on every keystroke
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        currentFilters.search = searchValue;

        // Apply search filter client-side (already loaded alerts)
        if (!allAlerts || allAlerts.length === 0) return;

        let filtered = allAlerts;
        if (searchValue) {
            const searchLower = searchValue.toLowerCase();
            filtered = allAlerts.filter(alert =>
                alert.park_name.toLowerCase().includes(searchLower)
            );
        }

        displayAlerts(filtered);
    }, 300); // 300ms debounce
}

/**
 * Populate park autocomplete datalist
 */
function populateParkAutocomplete(alerts) {
    const datalist = document.getElementById('park-names');
    if (!datalist) return;

    // Extract unique park names
    const parkNames = [...new Set(alerts.map(a => a.park_name))].sort();

    // Clear existing options
    datalist.innerHTML = '';

    // Add options
    parkNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        datalist.appendChild(option);
    });

    console.log(`Populated autocomplete with ${parkNames.length} park names`);
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

    // Load configuration first
    await loadConfig();

    // Load data
    await Promise.all([
        loadCategories(),
        loadStats(),
        loadAlerts()
    ]);

    // Setup event listeners
    document.getElementById('category-filter').addEventListener('change', onCategoryChange);
    document.getElementById('time-filter').addEventListener('change', onTimeChange);
    document.getElementById('search-input').addEventListener('input', onSearchInput);
    document.getElementById('clear-filters').addEventListener('click', clearFilters);
    document.getElementById('close-details').addEventListener('click', hideDetails);

    // Setup mobile filter toggle
    setupFilterToggle();

    // Setup boundary click handler for interactive park boundaries
    setupBoundaryClickHandler();

    console.log('Initialization complete');
}

// Make functions available globally for onclick handlers
window.showParkAlerts = showParkAlerts;
window.showAlertDetails = showAlertDetails;
window.previousAlert = previousAlert;
window.nextAlert = nextAlert;

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
