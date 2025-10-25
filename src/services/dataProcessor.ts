import { NPWSDatabase } from '../db/database';
import { AlertsFetcher } from './alertsFetcher';
import { GeoDataFetcher } from './geoDataFetcher';
import { AlertRecord, ReserveRecord, ProcessingStats } from '../models/types';

export class DataProcessor {
  private db: NPWSDatabase;
  private alertsFetcher: AlertsFetcher;
  private geoDataFetcher: GeoDataFetcher;

  constructor(
    db: NPWSDatabase,
    alertsFetcher: AlertsFetcher,
    geoDataFetcher: GeoDataFetcher
  ) {
    this.db = db;
    this.alertsFetcher = alertsFetcher;
    this.geoDataFetcher = geoDataFetcher;
  }

  /**
   * Process and sync all data (alerts + reserves)
   */
  public async syncAll(): Promise<ProcessingStats> {
    const stats: ProcessingStats = {
      alertsFetched: 0,
      alertsProcessed: 0,
      reservesFetched: 0,
      reservesProcessed: 0,
      errors: 0,
      timestamp: new Date().toISOString(),
    };

    const syncId = this.db.recordSyncStart('full');

    try {
      console.log('Starting full data sync...');

      // Sync reserves first (needed for alert matching)
      const reserveStats = await this.syncReserves();
      stats.reservesFetched = reserveStats.reservesFetched;
      stats.reservesProcessed = reserveStats.reservesProcessed;
      stats.errors += reserveStats.errors;

      // Sync alerts
      const alertStats = await this.syncAlerts();
      stats.alertsFetched = alertStats.alertsFetched;
      stats.alertsProcessed = alertStats.alertsProcessed;
      stats.errors += alertStats.errors;

      console.log('Data sync completed successfully');
      console.log('Stats:', stats);

      this.db.recordSyncComplete(syncId, stats, 'completed');

      return stats;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error during sync:', errorMessage);
      stats.errors++;

      this.db.recordSyncComplete(syncId, stats, 'failed', errorMessage);

      return stats;
    }
  }

  /**
   * Sync reserve data from ArcGIS
   */
  public async syncReserves(): Promise<ProcessingStats> {
    const stats: ProcessingStats = {
      alertsFetched: 0,
      alertsProcessed: 0,
      reservesFetched: 0,
      reservesProcessed: 0,
      errors: 0,
      timestamp: new Date().toISOString(),
    };

    console.log('Syncing reserve data...');

    const result = await this.geoDataFetcher.fetchAllReserves();

    if (!result.success || !result.data) {
      console.error('Failed to fetch reserves:', result.error);
      stats.errors++;
      return stats;
    }

    stats.reservesFetched = result.data.length;

    // Process and store reserves
    const reserves: Omit<ReserveRecord, 'id' | 'created_at' | 'updated_at'>[] = [];

    for (const feature of result.data) {
      try {
        const attrs = feature.attributes;
        const geometry = feature.geometry;

        // Format gazettal date if available (comes as Unix timestamp in milliseconds)
        let gazDate: string | null = null;
        if (attrs.GAZ_DATE) {
          try {
            gazDate = new Date(attrs.GAZ_DATE).toISOString();
          } catch (e) {
            // Keep as null if conversion fails
          }
        }

        const reserve: Omit<ReserveRecord, 'id' | 'created_at' | 'updated_at'> = {
          object_id: attrs.OBJECTID_1 || attrs.OBJECTID,
          name: attrs.NAME || '',
          name_short: attrs.NAME_SHORT || '',
          location: attrs.LOCATION || null,
          reserve_type: attrs.TYPE || null,
          reserve_no: attrs.RES_NO || null,
          gaz_area: attrs.GAZ_AREA || null,
          gis_area: attrs.GIS_AREA || null,
          gazettal_date: gazDate,
          geometry_type: this.geoDataFetcher.getGeometryType(geometry),
          raw_data: JSON.stringify(feature),
        };

        reserves.push(reserve);
      } catch (error) {
        console.error('Error processing reserve:', error);
        stats.errors++;
      }
    }

    // Batch insert/update reserves
    try {
      const processed = this.db.upsertReserves(reserves);
      stats.reservesProcessed = processed;
      console.log(`Processed ${processed} reserves`);
    } catch (error) {
      console.error('Error inserting reserves:', error);
      stats.errors++;
    }

    return stats;
  }

  /**
   * Sync alerts data from NPWS API
   */
  public async syncAlerts(): Promise<ProcessingStats> {
    const stats: ProcessingStats = {
      alertsFetched: 0,
      alertsProcessed: 0,
      reservesFetched: 0,
      reservesProcessed: 0,
      errors: 0,
      timestamp: new Date().toISOString(),
    };

    console.log('Syncing alerts data...');

    const { current, future } = await this.alertsFetcher.fetchAllAlerts();

    // Process current alerts
    if (current.success && current.data) {
      stats.alertsFetched += current.data.length;
      const processed = await this.processAlerts(current.data, false);
      stats.alertsProcessed += processed;
    } else {
      console.error('Failed to fetch current alerts:', current.error);
      stats.errors++;
    }

    // Process future alerts
    if (future.success && future.data) {
      stats.alertsFetched += future.data.length;
      const processed = await this.processAlerts(future.data, true);
      stats.alertsProcessed += processed;
    } else {
      console.error('Failed to fetch future alerts:', future.error);
      stats.errors++;
    }

    return stats;
  }

  /**
   * Process and store alerts in database
   */
  private async processAlerts(alerts: any[], isFuture: boolean): Promise<number> {
    const alertRecords: Omit<AlertRecord, 'id' | 'created_at' | 'updated_at'>[] = [];

    for (const alert of alerts) {
      try {
        // The alert now includes Park information
        const park = alert.Park;

        // Try to find matching reserve by name
        let reserve_id: number | null = null;
        const reserve = this.db.getReserveByName(park.Name);
        if (reserve) {
          reserve_id = reserve.object_id;
        }

        const alertRecord: Omit<AlertRecord, 'id' | 'created_at' | 'updated_at'> = {
          alert_id: alert.ID,
          park_name: park.Name,
          park_id: park.Id,
          reserve_id: reserve_id,
          alert_title: alert.Title,
          alert_description: alert.DescriptionHtml || '',
          alert_category: alert.Category,
          start_date: alert.EffectiveFrom,
          end_date: alert.EffectiveTo,
          last_reviewed: alert.LastReviewed,
          park_closed: alert.ParkClosed ? 1 : 0,
          park_part_closed: alert.ParkPartClosed ? 1 : 0,
          is_future: isFuture ? 1 : 0,
          raw_data: JSON.stringify(alert),
        };

        alertRecords.push(alertRecord);
      } catch (error) {
        console.error('Error processing alert:', error);
      }
    }

    // Batch insert/update alerts
    try {
      const processed = this.db.upsertAlerts(alertRecords);
      console.log(`Processed ${processed} ${isFuture ? 'future' : 'current'} alerts`);
      return processed;
    } catch (error) {
      console.error('Error inserting alerts:', error);
      return 0;
    }
  }

  /**
   * Get statistics about the current data
   */
  public getStats(): any {
    return this.db.getStats();
  }

  /**
   * Get sync history
   */
  public getSyncHistory(limit: number = 10): any[] {
    return this.db.getSyncHistory(limit);
  }

  /**
   * Get alerts with their associated reserve information
   */
  public getAlertsWithReserves(isFuture: boolean = false): any[] {
    return this.db.getAlertsWithReserves(isFuture);
  }

  /**
   * Export alerts and reserves as GeoJSON
   */
  public exportAsGeoJSON(): any {
    const alertsWithReserves = this.db.getAlertsWithReserves(false);
    const reserves = this.db.getAllReserves();

    // Create GeoJSON FeatureCollection
    const features = alertsWithReserves.map((alert: any) => {
      // Try to find reserve with geometry by matching object_id
      const reserve = reserves.find(r => r.object_id === alert.reserve_id);

      let geometry = null;
      if (reserve && reserve.raw_data) {
        try {
          const reserveData = JSON.parse(reserve.raw_data);
          geometry = reserveData.geometry || null;
        } catch (e) {
          console.error('Error parsing reserve geometry:', e);
        }
      }

      return {
        type: 'Feature',
        properties: {
          alert_id: alert.alert_id,
          alert_title: alert.alert_title,
          alert_description: alert.alert_description,
          alert_type: alert.alert_type,
          alert_status: alert.alert_status,
          start_date: alert.start_date,
          end_date: alert.end_date,
          reserve_name_short: alert.reserve_name_short,
          reserve_name_long: alert.reserve_name_long,
        },
        geometry: geometry,
      };
    });

    return {
      type: 'FeatureCollection',
      features: features,
    };
  }
}
