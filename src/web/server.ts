import express from 'express';
import cors from 'cors';
import path from 'path';
import { loadConfig } from '../config';
import { NPWSDatabase } from '../db/database';

const app = express();
const PORT = process.env.PORT || 3000;

// Load configuration and initialize database
const config = loadConfig();
const db = new NPWSDatabase(config.databasePath);

// Load manual park mappings from CSV on startup
console.log('Loading manual park mappings from CSV...');
db.loadManualMappingsFromCSV();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

/**
 * Utility Functions
 */

// Create URL-friendly slug from text
function createSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')      // Replace spaces with hyphens
    .replace(/-+/g, '-')       // Replace multiple hyphens with single
    .replace(/^-+|-+$/g, '');  // Remove leading/trailing hyphens
}

// Extract numeric ID from NPWS alert_id (e.g., "npws-fis@id.ngcomms.net/eme/8478122" -> "8478122")
function extractNPWSId(alertId: string): string {
  const match = alertId.match(/\/(\d+)$/);
  return match ? match[1] : alertId;
}

/**
 * API Routes
 */

// Get all alerts with optional filtering
app.get('/api/alerts', (req, res) => {
  try {
    const { category, is_future, park_name, include_inactive } = req.query;

    let query = 'SELECT * FROM alerts WHERE 1=1';
    const params: any[] = [];

    // Filter by is_active unless explicitly requested to include inactive
    if (include_inactive !== 'true') {
      query += ' AND is_active = 1';
    }

    if (category) {
      query += ' AND alert_category = ?';
      params.push(category);
    }

    if (is_future !== undefined) {
      query += ' AND is_future = ?';
      params.push(is_future === 'true' ? 1 : 0);
    }

    if (park_name) {
      query += ' AND park_name LIKE ?';
      params.push(`%${park_name}%`);
    }

    query += ' ORDER BY start_date DESC';

    const stmt = db['db'].prepare(query);
    const alerts = stmt.all(...params);

    res.json({
      success: true,
      count: alerts.length,
      data: alerts,
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alerts',
    });
  }
});

// Get alerts with reserve information (for mapping)
app.get('/api/alerts/with-reserves', (req, res) => {
  try {
    const { category, is_future, include_inactive } = req.query;

    let query = `
      SELECT
        a.*,
        r.name as reserve_name,
        r.name_short as reserve_name_short,
        r.location as reserve_location,
        r.reserve_type as reserve_type,
        r.gis_area as reserve_area,
        r.centroid_lat,
        r.centroid_lon,
        r.object_id as reserve_object_id
      FROM alerts a
      LEFT JOIN park_mappings pm ON a.park_id = pm.park_id
      LEFT JOIN reserves r ON pm.object_id = r.object_id
      WHERE 1=1
    `;
    const params: any[] = [];

    // Filter by is_active unless explicitly requested to include inactive
    if (include_inactive !== 'true') {
      query += ' AND a.is_active = 1';
    }

    if (category) {
      query += ' AND a.alert_category = ?';
      params.push(category);
    }

    if (is_future !== undefined) {
      query += ' AND a.is_future = ?';
      params.push(is_future === 'true' ? 1 : 0);
    }

    query += ' ORDER BY a.start_date DESC';

    const stmt = db['db'].prepare(query);
    const alerts = stmt.all(...params);

    res.json({
      success: true,
      count: alerts.length,
      data: alerts,
    });
  } catch (error) {
    console.error('Error fetching alerts with reserves:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alerts with reserves',
    });
  }
});

// Get unique alert categories for filtering
app.get('/api/alerts/categories', (req, res) => {
  try {
    const stmt = db['db'].prepare(`
      SELECT DISTINCT alert_category
      FROM alerts
      WHERE alert_category IS NOT NULL AND is_active = 1
      ORDER BY alert_category
    `);
    const categories = stmt.all();

    res.json({
      success: true,
      data: categories.map((c: any) => c.alert_category),
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch categories',
    });
  }
});

// API endpoint: Get alerts for a specific park by slug (using reserve name_short)
app.get('/api/alert/:parkSlug', (req, res) => {
  try {
    const { parkSlug } = req.params;

    // Find reserve by matching slug against name_short or location
    const reserveStmt = db['db'].prepare(`
      SELECT object_id, name, name_short, location, centroid_lat, centroid_lon
      FROM reserves
    `);
    const reserves = reserveStmt.all() as any[];

    // Find matching reserve by slug (check both name_short and location for Flora Reserves)
    const matchingReserve = reserves.find((r: any) => {
      // For Flora Reserves (NPWS Managed Other), match against location field
      if (r.name_short === 'NPWS Managed Other' && r.location) {
        return createSlug(r.location) === parkSlug;
      }
      // For regular reserves, match against name_short
      return createSlug(r.name_short) === parkSlug;
    });

    if (!matchingReserve) {
      return res.status(404).json({
        success: false,
        error: 'Park not found',
      });
    }

    // Get all active alerts for this reserve
    const alertsStmt = db['db'].prepare(`
      SELECT a.*, r.name as reserve_name, r.name_short as reserve_name_short,
             r.location as reserve_location,
             r.centroid_lat, r.centroid_lon, r.object_id as reserve_object_id
      FROM alerts a
      INNER JOIN park_mappings pm ON a.park_id = pm.park_id
      INNER JOIN reserves r ON pm.object_id = r.object_id
      WHERE r.object_id = ? AND a.is_active = 1
      ORDER BY a.alert_category, a.start_date
    `);
    const alerts = alertsStmt.all(matchingReserve.object_id);

    res.json({
      success: true,
      data: {
        reserve: matchingReserve,
        alerts: alerts,
      },
    });
  } catch (error) {
    console.error('Error fetching park alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch park alerts',
    });
  }
});

// API endpoint: Get specific alert by park slug, alert slug, and NPWS ID number
app.get('/api/alert/:parkSlug/:alertSlug/:npwsId', (req, res) => {
  try {
    const { parkSlug, alertSlug, npwsId } = req.params;

    // Fetch alert with reserve information
    // Use indexed npws_id column for fast lookup
    const stmt = db['db'].prepare(`
      SELECT a.*, r.name as reserve_name, r.name_short as reserve_name_short,
             r.location as reserve_location,
             r.centroid_lat, r.centroid_lon, r.object_id as reserve_object_id
      FROM alerts a
      LEFT JOIN park_mappings pm ON a.park_id = pm.park_id
      LEFT JOIN reserves r ON pm.object_id = r.object_id
      WHERE a.npws_id = ? AND a.is_active = 1
      LIMIT 1
    `);
    const alert = stmt.get(npwsId);

    if (!alert) {
      return res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
    }

    res.json({
      success: true,
      data: alert,
    });
  } catch (error) {
    console.error('Error fetching alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert',
    });
  }
});

// Get all reserves
app.get('/api/reserves', (req, res) => {
  try {
    const reserves = db.getAllReserves();

    res.json({
      success: true,
      count: reserves.length,
      data: reserves,
    });
  } catch (error) {
    console.error('Error fetching reserves:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reserves',
    });
  }
});

// Get reserve by name
app.get('/api/reserves/:name', (req, res) => {
  try {
    const { name } = req.params;
    const reserve = db.getReserveByName(name);

    if (reserve) {
      res.json({
        success: true,
        data: reserve,
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Reserve not found',
      });
    }
  } catch (error) {
    console.error('Error fetching reserve:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch reserve',
    });
  }
});

// Get unmapped alerts (alerts without a park mapping)
app.get('/api/unmapped-alerts', (req, res) => {
  try {
    const { is_future } = req.query;
    const isFuture = is_future === 'true';

    const unmappedAlerts = db.getUnmappedAlerts(isFuture);

    res.json({
      success: true,
      count: unmappedAlerts.length,
      data: unmappedAlerts,
    });
  } catch (error) {
    console.error('Error fetching unmapped alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unmapped alerts',
    });
  }
});

// Get unmapped parks (unique parks without a park mapping, across all alerts)
app.get('/api/unmapped-parks', (req, res) => {
  try {
    const unmappedParks = db.getUnmappedParks();

    res.json({
      success: true,
      count: unmappedParks.length,
      data: unmappedParks,
    });
  } catch (error) {
    console.error('Error fetching unmapped parks:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch unmapped parks',
    });
  }
});

// Get configuration (for frontend to access ArcGIS URLs, etc.)
app.get('/api/config', (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        arcgisServiceUrl: config.geoDataUrl,
      },
    });
  } catch (error) {
    console.error('Error fetching config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch config',
    });
  }
});

// Get database statistics
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();

    // Get category breakdown (only active alerts)
    const categoryStmt = db['db'].prepare(`
      SELECT alert_category, COUNT(*) as count
      FROM alerts
      WHERE is_active = 1
      GROUP BY alert_category
      ORDER BY count DESC
    `);
    const categoryBreakdown = categoryStmt.all();

    res.json({
      success: true,
      data: {
        ...stats,
        categoryBreakdown,
      },
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats',
    });
  }
});

// API documentation landing page
app.get('/api', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>NPWS Alerts API Documentation</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          max-width: 1000px;
          margin: 0 auto;
          padding: 2rem;
          line-height: 1.6;
          color: #333;
        }
        h1 {
          color: #2c3e50;
          border-bottom: 3px solid #3498db;
          padding-bottom: 0.5rem;
        }
        h2 {
          color: #34495e;
          margin-top: 2rem;
        }
        .endpoint {
          background: #f8f9fa;
          border-left: 4px solid #3498db;
          padding: 1rem;
          margin: 1rem 0;
          border-radius: 4px;
        }
        .method {
          display: inline-block;
          background: #3498db;
          color: white;
          padding: 0.2rem 0.5rem;
          border-radius: 3px;
          font-weight: bold;
          font-size: 0.9rem;
          margin-right: 0.5rem;
        }
        .path {
          font-family: 'Courier New', monospace;
          font-weight: bold;
          color: #2c3e50;
        }
        .description {
          margin-top: 0.5rem;
          color: #555;
        }
        .params {
          margin-top: 0.5rem;
          font-size: 0.9rem;
        }
        .param-name {
          font-family: 'Courier New', monospace;
          background: #e9ecef;
          padding: 0.1rem 0.3rem;
          border-radius: 2px;
        }
        code {
          background: #e9ecef;
          padding: 0.1rem 0.4rem;
          border-radius: 3px;
          font-family: 'Courier New', monospace;
        }
        .footer {
          margin-top: 3rem;
          padding-top: 1rem;
          border-top: 1px solid #dee2e6;
          text-align: center;
          color: #6c757d;
          font-size: 0.9rem;
        }
      </style>
    </head>
    <body>
      <h1>NPWS Alerts API Documentation</h1>
      <p>RESTful API for accessing NSW National Parks and Wildlife Service alerts and reserve information.</p>

      <h2>Alerts Endpoints</h2>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/alerts</span></div>
        <div class="description">Get all active alerts with optional filtering</div>
        <div class="params">
          <strong>Query Parameters:</strong><br>
          <span class="param-name">category</span> - Filter by alert category<br>
          <span class="param-name">is_future</span> - Filter by future alerts (true/false)<br>
          <span class="param-name">park_name</span> - Filter by park name (partial match)<br>
          <span class="param-name">include_inactive</span> - Include inactive alerts (true/false)
        </div>
      </div>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/alerts/with-reserves</span></div>
        <div class="description">Get all active alerts with associated reserve information (for mapping)</div>
        <div class="params">
          <strong>Query Parameters:</strong><br>
          <span class="param-name">category</span> - Filter by alert category<br>
          <span class="param-name">is_future</span> - Filter by future alerts (true/false)<br>
          <span class="param-name">include_inactive</span> - Include inactive alerts (true/false)
        </div>
      </div>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/alerts/categories</span></div>
        <div class="description">Get unique alert categories for filtering</div>
      </div>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/alert/:parkSlug</span></div>
        <div class="description">Get all alerts for a specific park by slug (e.g., "wollemi-np")</div>
        <div class="params">
          <strong>Path Parameters:</strong><br>
          <span class="param-name">parkSlug</span> - URL-friendly park name slug
        </div>
      </div>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/alert/:parkSlug/:alertSlug/:npwsId</span></div>
        <div class="description">Get a specific alert by park slug, alert slug, and NPWS ID</div>
        <div class="params">
          <strong>Path Parameters:</strong><br>
          <span class="param-name">parkSlug</span> - URL-friendly park name slug<br>
          <span class="param-name">alertSlug</span> - URL-friendly alert title slug<br>
          <span class="param-name">npwsId</span> - NPWS alert ID number
        </div>
      </div>

      <h2>Reserves Endpoints</h2>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/reserves</span></div>
        <div class="description">Get all reserves</div>
      </div>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/reserves/:name</span></div>
        <div class="description">Get reserve by name (case-insensitive)</div>
        <div class="params">
          <strong>Path Parameters:</strong><br>
          <span class="param-name">name</span> - Reserve name
        </div>
      </div>

      <h2>Utility Endpoints</h2>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/unmapped-alerts</span></div>
        <div class="description">Get alerts without a park mapping</div>
        <div class="params">
          <strong>Query Parameters:</strong><br>
          <span class="param-name">is_future</span> - Filter by future alerts (true/false)
        </div>
      </div>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/unmapped-parks</span></div>
        <div class="description">Get unique parks without a mapping (across all alerts)</div>
      </div>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/config</span></div>
        <div class="description">Get configuration (ArcGIS service URLs, etc.)</div>
      </div>

      <div class="endpoint">
        <div><span class="method">GET</span><span class="path">/api/stats</span></div>
        <div class="description">Get database statistics (alert count, reserve count, last sync time, category breakdown)</div>
      </div>

      <h2>Response Format</h2>
      <p>All endpoints return JSON with the following structure:</p>
      <pre><code>{
  "success": true,
  "count": 123,        // Optional: number of results
  "data": { ... }      // Response data
}</code></pre>

      <div class="footer">
        <p>NPWS Alerts API | <a href="/">View Map Interface</a></p>
      </div>
    </body>
    </html>
  `);
});

// Serve index.html for root route
// Page routes - serve HTML (must come after API routes)
app.get('/alert/:parkSlug/:alertSlug/:npwsId', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

app.get('/alert/:parkSlug', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(60));
  console.log('NPWS Alerts Web Server');
  console.log('='.repeat(60));
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Database: ${config.databasePath}`);
  console.log('');
  console.log('Available endpoints:');
  console.log('  GET  /                           - Web interface');
  console.log('  GET  /api/alerts                 - Get all alerts');
  console.log('  GET  /api/alerts/with-reserves   - Get alerts with reserve data');
  console.log('  GET  /api/alerts/categories      - Get unique categories');
  console.log('  GET  /api/unmapped-alerts        - Get unmapped alerts');
  console.log('  GET  /api/unmapped-parks         - Get unmapped parks');
  console.log('  GET  /api/reserves               - Get all reserves');
  console.log('  GET  /api/reserves/:name         - Get reserve by name');
  console.log('  GET  /api/config                 - Get configuration');
  console.log('  GET  /api/stats                  - Get database statistics');
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  process.exit(0);
});
