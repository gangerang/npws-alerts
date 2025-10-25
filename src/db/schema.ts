import Database from 'better-sqlite3';

export class DatabaseSchema {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Initialize the database schema
   */
  public initialize(): void {
    console.log('Initializing database schema...');

    // Enable SpatiaLite extension
    this.loadSpatiaLite();

    // Create tables
    this.createAlertsTable();
    this.createReservesTable();
    this.createSyncHistoryTable();

    // Create indexes
    this.createIndexes();

    console.log('Database schema initialized successfully');
  }

  /**
   * Load SpatiaLite extension
   */
  private loadSpatiaLite(): void {
    try {
      // Try to load SpatiaLite extension
      // The extension file name varies by platform:
      // - Linux: mod_spatialite.so
      // - macOS: mod_spatialite.dylib
      // - Windows: mod_spatialite.dll

      // Note: You may need to install SpatiaLite separately
      // and ensure it's in the system path

      // For now, we'll create a geometry column as TEXT (WKT format)
      // and can upgrade to proper SpatiaLite geometry later
      console.log('Note: Using WKT text format for geometry. Install SpatiaLite for full spatial support.');
    } catch (error) {
      console.warn('SpatiaLite extension not loaded. Using WKT text format for geometry.');
    }
  }

  /**
   * Create alerts table
   */
  private createAlertsTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        alert_id TEXT NOT NULL,
        park_name TEXT NOT NULL,
        park_id TEXT NOT NULL,
        reserve_id INTEGER,
        alert_title TEXT NOT NULL,
        alert_description TEXT,
        alert_category TEXT,
        start_date TEXT,
        end_date TEXT,
        last_reviewed TEXT,
        park_closed INTEGER NOT NULL DEFAULT 0,
        park_part_closed INTEGER NOT NULL DEFAULT 0,
        is_future INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        raw_data TEXT,
        UNIQUE(alert_id, is_future)
      )
    `);

    console.log('Created alerts table');
  }

  /**
   * Create reserves table with geometry support
   */
  private createReservesTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reserves (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        object_id INTEGER NOT NULL UNIQUE,
        name TEXT NOT NULL,
        name_short TEXT NOT NULL,
        location TEXT,
        reserve_type TEXT,
        reserve_no TEXT,
        gaz_area REAL,
        gis_area REAL,
        gazettal_date TEXT,
        geometry_type TEXT,
        geometry_wkt TEXT,
        centroid_lat REAL,
        centroid_lon REAL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        raw_data TEXT
      )
    `);

    console.log('Created reserves table');
  }

  /**
   * Create sync history table to track data fetching operations
   */
  private createSyncHistoryTable(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,
        sync_status TEXT NOT NULL,
        alerts_fetched INTEGER DEFAULT 0,
        alerts_processed INTEGER DEFAULT 0,
        reserves_fetched INTEGER DEFAULT 0,
        reserves_processed INTEGER DEFAULT 0,
        errors INTEGER DEFAULT 0,
        error_message TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER
      )
    `);

    console.log('Created sync_history table');
  }

  /**
   * Create indexes for better query performance
   */
  private createIndexes(): void {
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_alerts_park_name
        ON alerts(park_name);

      CREATE INDEX IF NOT EXISTS idx_alerts_park_id
        ON alerts(park_id);

      CREATE INDEX IF NOT EXISTS idx_alerts_category
        ON alerts(alert_category);

      CREATE INDEX IF NOT EXISTS idx_alerts_dates
        ON alerts(start_date, end_date);

      CREATE INDEX IF NOT EXISTS idx_reserves_name
        ON reserves(name);

      CREATE INDEX IF NOT EXISTS idx_reserves_name_short
        ON reserves(name_short);

      CREATE INDEX IF NOT EXISTS idx_sync_history_type
        ON sync_history(sync_type, started_at);
    `);

    console.log('Created indexes');
  }

  /**
   * Drop all tables (for testing/reset)
   */
  public dropAllTables(): void {
    this.db.exec(`
      DROP TABLE IF EXISTS alerts;
      DROP TABLE IF EXISTS reserves;
      DROP TABLE IF EXISTS sync_history;
    `);

    console.log('Dropped all tables');
  }
}
