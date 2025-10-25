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

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../../public')));

/**
 * API Routes
 */

// Get all alerts with optional filtering
app.get('/api/alerts', (req, res) => {
  try {
    const { category, is_future, park_name } = req.query;

    let query = 'SELECT * FROM alerts WHERE 1=1';
    const params: any[] = [];

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
    const { category, is_future } = req.query;

    let query = `
      SELECT
        a.*,
        r.name as reserve_name,
        r.name_short as reserve_name_short,
        r.location as reserve_location,
        r.reserve_type as reserve_type,
        r.gis_area as reserve_area,
        r.geometry_type as reserve_geometry_type,
        r.raw_data as reserve_raw_data
      FROM alerts a
      LEFT JOIN reserves r ON a.park_name = r.name OR a.park_name = r.name_short
      WHERE 1=1
    `;
    const params: any[] = [];

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

    // Parse reserve geometry if available
    const alertsWithGeometry = alerts.map((alert: any) => {
      let geometry = null;
      if (alert.reserve_raw_data) {
        try {
          const reserveData = JSON.parse(alert.reserve_raw_data);
          geometry = reserveData.geometry || null;
        } catch (e) {
          // Ignore parse errors
        }
      }

      return {
        ...alert,
        reserve_raw_data: undefined, // Don't send full raw data to client
        geometry,
      };
    });

    res.json({
      success: true,
      count: alertsWithGeometry.length,
      data: alertsWithGeometry,
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
      WHERE alert_category IS NOT NULL
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

// Get database statistics
app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();

    // Get category breakdown
    const categoryStmt = db['db'].prepare(`
      SELECT alert_category, COUNT(*) as count
      FROM alerts
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

// Serve index.html for root route
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
  console.log('  GET  /api/reserves               - Get all reserves');
  console.log('  GET  /api/reserves/:name         - Get reserve by name');
  console.log('  GET  /api/stats                  - Get database statistics');
  console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  db.close();
  process.exit(0);
});
