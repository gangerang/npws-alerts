import Database from 'better-sqlite3';
import { DatabaseSchema } from './schema';
import { AlertRecord, ReserveRecord, ParkMappingRecord, ProcessingStats } from '../models/types';
import * as fs from 'fs';
import * as path from 'path';

export class NPWSDatabase {
  private db: Database.Database;
  private schema: DatabaseSchema;

  constructor(dbPath: string) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Open database connection
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance for concurrent access
    this.db.pragma('foreign_keys = ON');

    // Initialize schema
    this.schema = new DatabaseSchema(this.db);
    this.schema.initialize();
  }

  /**
   * Close database connection
   */
  public close(): void {
    this.db.close();
  }

  /**
   * Insert or update an alert
   */
  public upsertAlert(alert: Omit<AlertRecord, 'id' | 'created_at' | 'updated_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO alerts (
        alert_id, park_name, park_id, alert_title, alert_description,
        alert_category, start_date, end_date, last_reviewed,
        park_closed, park_part_closed, is_future
      ) VALUES (
        @alert_id, @park_name, @park_id, @alert_title, @alert_description,
        @alert_category, @start_date, @end_date, @last_reviewed,
        @park_closed, @park_part_closed, @is_future
      )
      ON CONFLICT(alert_id, is_future) DO UPDATE SET
        park_name = @park_name,
        park_id = @park_id,
        alert_title = @alert_title,
        alert_description = @alert_description,
        alert_category = @alert_category,
        start_date = @start_date,
        end_date = @end_date,
        last_reviewed = @last_reviewed,
        park_closed = @park_closed,
        park_part_closed = @park_part_closed,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(alert);
  }

  /**
   * Insert multiple alerts in a transaction
   */
  public upsertAlerts(alerts: Omit<AlertRecord, 'id' | 'created_at' | 'updated_at'>[]): number {
    const insert = this.db.transaction((alerts: Omit<AlertRecord, 'id' | 'created_at' | 'updated_at'>[]) => {
      for (const alert of alerts) {
        this.upsertAlert(alert);
      }
      return alerts.length;
    });

    return insert(alerts);
  }

  /**
   * Insert or update a reserve
   */
  public upsertReserve(reserve: Omit<ReserveRecord, 'id' | 'created_at' | 'updated_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO reserves (
        object_id, name, name_short, location, reserve_type,
        reserve_no, gaz_area, gis_area, gazettal_date, centroid_lat, centroid_lon
      ) VALUES (
        @object_id, @name, @name_short, @location, @reserve_type,
        @reserve_no, @gaz_area, @gis_area, @gazettal_date, @centroid_lat, @centroid_lon
      )
      ON CONFLICT(object_id) DO UPDATE SET
        name = @name,
        name_short = @name_short,
        location = @location,
        reserve_type = @reserve_type,
        reserve_no = @reserve_no,
        gaz_area = @gaz_area,
        gis_area = @gis_area,
        gazettal_date = @gazettal_date,
        centroid_lat = @centroid_lat,
        centroid_lon = @centroid_lon,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(reserve);
  }

  /**
   * Insert multiple reserves in a transaction
   */
  public upsertReserves(reserves: Omit<ReserveRecord, 'id' | 'created_at' | 'updated_at'>[]): number {
    const insert = this.db.transaction((reserves: Omit<ReserveRecord, 'id' | 'created_at' | 'updated_at'>[]) => {
      for (const reserve of reserves) {
        this.upsertReserve(reserve);
      }
      return reserves.length;
    });

    return insert(reserves);
  }

  /**
   * Get all active alerts
   */
  public getActiveAlerts(isFuture: boolean = false): AlertRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM alerts
      WHERE is_future = ?
      ORDER BY start_date DESC
    `);

    return stmt.all(isFuture ? 1 : 0) as AlertRecord[];
  }

  /**
   * Get alerts by park name
   */
  public getAlertsByParkName(parkName: string, isFuture: boolean = false): AlertRecord[] {
    const stmt = this.db.prepare(`
      SELECT * FROM alerts
      WHERE park_name = ? AND is_future = ?
      ORDER BY start_date DESC
    `);

    return stmt.all(parkName, isFuture ? 1 : 0) as AlertRecord[];
  }

  /**
   * Get reserve by name (case-insensitive)
   */
  public getReserveByName(name: string): ReserveRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM reserves
      WHERE LOWER(name) = LOWER(?)
    `);

    return stmt.get(name) as ReserveRecord | undefined;
  }

  /**
   * Get reserve by name_short
   */
  public getReserveByNameShort(nameShort: string): ReserveRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM reserves
      WHERE name_short = ?
    `);

    return stmt.get(nameShort) as ReserveRecord | undefined;
  }

  /**
   * Get all reserves
   */
  public getAllReserves(): ReserveRecord[] {
    const stmt = this.db.prepare('SELECT * FROM reserves ORDER BY name_short');
    return stmt.all() as ReserveRecord[];
  }

  /**
   * Insert or update a park mapping
   */
  public upsertParkMapping(mapping: Omit<ParkMappingRecord, 'id' | 'created_at' | 'updated_at'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO park_mappings (
        park_id, park_name, object_id, reserve_name
      ) VALUES (
        @park_id, @park_name, @object_id, @reserve_name
      )
      ON CONFLICT(park_id) DO UPDATE SET
        park_name = @park_name,
        object_id = @object_id,
        reserve_name = @reserve_name,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run(mapping);
  }

  /**
   * Get park mapping by park_id
   */
  public getParkMapping(parkId: string): ParkMappingRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT * FROM park_mappings
      WHERE park_id = ?
    `);

    return stmt.get(parkId) as ParkMappingRecord | undefined;
  }

  /**
   * Get all unmapped alerts (alerts without a park mapping)
   */
  public getUnmappedAlerts(isFuture: boolean = false): AlertRecord[] {
    const stmt = this.db.prepare(`
      SELECT a.* FROM alerts a
      LEFT JOIN park_mappings pm ON a.park_id = pm.park_id
      WHERE pm.park_id IS NULL AND a.is_future = ?
      ORDER BY a.park_name
    `);

    return stmt.all(isFuture ? 1 : 0) as AlertRecord[];
  }

  /**
   * Get alerts with their associated reserve information
   */
  public getAlertsWithReserves(isFuture: boolean = false): any[] {
    const stmt = this.db.prepare(`
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
      WHERE a.is_future = ?
      ORDER BY a.start_date DESC
    `);

    return stmt.all(isFuture ? 1 : 0);
  }

  /**
   * Record sync history
   */
  public recordSyncStart(syncType: string): number {
    const stmt = this.db.prepare(`
      INSERT INTO sync_history (sync_type, sync_status, started_at)
      VALUES (?, 'running', CURRENT_TIMESTAMP)
    `);

    const result = stmt.run(syncType);
    return result.lastInsertRowid as number;
  }

  /**
   * Update sync history on completion
   */
  public recordSyncComplete(
    syncId: number,
    stats: ProcessingStats,
    status: 'completed' | 'failed',
    errorMessage?: string
  ): void {
    const stmt = this.db.prepare(`
      UPDATE sync_history
      SET
        sync_status = ?,
        alerts_fetched = ?,
        alerts_processed = ?,
        reserves_fetched = ?,
        reserves_processed = ?,
        errors = ?,
        error_message = ?,
        completed_at = CURRENT_TIMESTAMP,
        duration_ms = (julianday(CURRENT_TIMESTAMP) - julianday(started_at)) * 86400000
      WHERE id = ?
    `);

    stmt.run(
      status,
      stats.alertsFetched,
      stats.alertsProcessed,
      stats.reservesFetched,
      stats.reservesProcessed,
      stats.errors,
      errorMessage || null,
      syncId
    );
  }

  /**
   * Get recent sync history
   */
  public getSyncHistory(limit: number = 10): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM sync_history
      ORDER BY started_at DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Get database statistics
   */
  public getStats(): { alerts: number; reserves: number; lastSync: string | null } {
    const alertCount = this.db.prepare('SELECT COUNT(*) as count FROM alerts').get() as { count: number };
    const reserveCount = this.db.prepare('SELECT COUNT(*) as count FROM reserves').get() as { count: number };
    const lastSync = this.db.prepare(
      "SELECT started_at FROM sync_history WHERE sync_status = 'completed' ORDER BY started_at DESC LIMIT 1"
    ).get() as { started_at: string } | undefined;

    return {
      alerts: alertCount.count,
      reserves: reserveCount.count,
      lastSync: lastSync?.started_at || null,
    };
  }
}
