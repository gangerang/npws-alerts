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

        // Format gazettal date if available (comes as Unix timestamp in milliseconds)
        let gazDate: string | null = null;
        if (attrs.GAZ_DATE) {
          try {
            gazDate = new Date(attrs.GAZ_DATE).toISOString();
          } catch (e) {
            // Keep as null if conversion fails
          }
        }

        // Extract centroid
        const centroid = this.geoDataFetcher.getCentroid(feature);

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
          centroid_lat: centroid?.lat || null,
          centroid_lon: centroid?.lon || null,
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

        // Check if park mapping already exists
        let mapping = this.db.getParkMapping(park.Id);

        if (!mapping) {
          // Try to find matching reserve by name (case-insensitive)
          const reserve = this.db.getReserveByName(park.Name);

          if (reserve) {
            // Create new park mapping
            this.db.upsertParkMapping({
              park_id: park.Id,
              park_name: park.Name,
              object_id: reserve.object_id,
              reserve_name: reserve.name,
            });
            console.log(`Created mapping: "${park.Name}" -> "${reserve.name}" (ID: ${reserve.object_id})`);
          } else {
            // No matching reserve found - alert will be unmapped
            console.log(`No reserve match found for park: "${park.Name}" (ID: ${park.Id})`);
          }
        }

        const alertRecord: Omit<AlertRecord, 'id' | 'created_at' | 'updated_at'> = {
          alert_id: alert.ID,
          park_name: park.Name,
          park_id: park.Id,
          alert_title: alert.Title,
          alert_description: alert.DescriptionHtml || '',
          alert_category: alert.Category,
          start_date: alert.EffectiveFrom,
          end_date: alert.EffectiveTo,
          last_reviewed: alert.LastReviewed,
          park_closed: alert.ParkClosed ? 1 : 0,
          park_part_closed: alert.ParkPartClosed ? 1 : 0,
          is_future: isFuture ? 1 : 0,
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
   * Export alerts and reserves as GeoJSON (using centroids only)
   */
  public exportAsGeoJSON(): any {
    const alertsWithReserves = this.db.getAlertsWithReserves(false);

    // Create GeoJSON FeatureCollection
    const features = alertsWithReserves
      .filter((alert: any) => alert.centroid_lat && alert.centroid_lon)
      .map((alert: any) => {
        return {
          type: 'Feature',
          properties: {
            alert_id: alert.alert_id,
            alert_title: alert.alert_title,
            alert_description: alert.alert_description,
            alert_category: alert.alert_category,
            park_name: alert.park_name,
            start_date: alert.start_date,
            end_date: alert.end_date,
            reserve_name: alert.reserve_name,
            reserve_name_short: alert.reserve_name_short,
          },
          geometry: {
            type: 'Point',
            coordinates: [alert.centroid_lon, alert.centroid_lat],
          },
        };
      });

    return {
      type: 'FeatureCollection',
      features: features,
    };
  }
}
