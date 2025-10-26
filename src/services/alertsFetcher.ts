import { AlertsAPIResponse, NPWSAlert, FetchResult } from '../models/types';

export class AlertsFetcher {
  private currentAlertsUrl: string;
  private futureAlertsUrl: string;

  constructor(currentAlertsUrl: string, futureAlertsUrl: string) {
    this.currentAlertsUrl = currentAlertsUrl;
    this.futureAlertsUrl = futureAlertsUrl;
  }

  /**
   * Fetch current alerts from NPWS API
   */
  public async fetchCurrentAlerts(): Promise<FetchResult<NPWSAlert[]>> {
    return this.fetchAlerts(this.currentAlertsUrl, false);
  }

  /**
   * Fetch future alerts from NPWS API
   */
  public async fetchFutureAlerts(): Promise<FetchResult<NPWSAlert[]>> {
    return this.fetchAlerts(this.futureAlertsUrl, true);
  }

  /**
   * Fetch alerts from specified URL
   * Returns park alerts with their associated park information
   */
  private async fetchAlerts(url: string, isFuture: boolean): Promise<FetchResult<any[]>> {
    try {
      console.log(`Fetching ${isFuture ? 'future' : 'current'} alerts from ${url}...`);

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NPWS-Alerts-Collector/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: any = await response.json();

      // The API returns { Categories: [...], ParkAlerts: [...] }
      if (data.ParkAlerts && Array.isArray(data.ParkAlerts)) {
        // Flatten the structure - each park can have multiple alerts
        const allAlerts: any[] = [];
        let parksWithNoAlerts = 0;
        let alertsWithMissingData = 0;

        for (const parkAlert of data.ParkAlerts) {
          const park = parkAlert.Park;
          const alerts = parkAlert.Alerts || [];

          if (alerts.length === 0) {
            parksWithNoAlerts++;
            console.warn(`Park "${park?.Name || 'Unknown'}" (ID: ${park?.Id || 'Unknown'}) has no alerts`);
            continue;
          }

          // Add park information to each alert
          for (const alert of alerts) {
            // Validate required fields
            if (!alert.ID || !alert.Title || !park?.Name || !park?.Id) {
              alertsWithMissingData++;
              console.warn(`Alert missing required data: alert_id=${alert.ID}, title=${alert.Title}, park=${park?.Name}, park_id=${park?.Id}`);
              continue;
            }

            allAlerts.push({
              ...alert,
              Park: park,
              ParkClosed: parkAlert.Closed,
              ParkPartClosed: parkAlert.PartClosed,
              ClosedAreasCount: parkAlert.ClosedAreasCount,
            });
          }
        }

        console.log(`Fetched ${allAlerts.length} ${isFuture ? 'future' : 'current'} alerts from ${data.ParkAlerts.length} parks`);
        console.log(`  - Parks with no alerts: ${parksWithNoAlerts}`);
        console.log(`  - Alerts with missing data (skipped): ${alertsWithMissingData}`);
        if (allAlerts.length > 0) {
          console.log(`  - Sample alert IDs: ${allAlerts.slice(0, 3).map(a => a.ID).join(', ')}`);
        }

        // Check for duplicate alert IDs
        const alertIds = allAlerts.map(a => a.ID);
        const uniqueAlertIds = new Set(alertIds);
        const duplicateCount = alertIds.length - uniqueAlertIds.size;

        if (duplicateCount > 0) {
          console.warn(`\n⚠ DUPLICATE ALERT IDS DETECTED!`);
          console.warn(`  - Total alerts: ${alertIds.length}`);
          console.warn(`  - Unique alert IDs: ${uniqueAlertIds.size}`);
          console.warn(`  - Duplicate count: ${duplicateCount}`);

          // Find which IDs are duplicated
          const idCounts = new Map<string, number>();
          alertIds.forEach(id => {
            idCounts.set(id, (idCounts.get(id) || 0) + 1);
          });

          const duplicates = Array.from(idCounts.entries())
            .filter(([_, count]) => count > 1)
            .sort((a, b) => b[1] - a[1]); // Sort by count descending

          console.warn(`  - Duplicated alert IDs (showing up to 10):`);
          duplicates.slice(0, 10).forEach(([id, count]) => {
            const alerts = allAlerts.filter(a => a.ID === id);
            const parks = alerts.map(a => a.Park?.Name).join(', ');
            console.warn(`    - Alert ${id}: appears ${count} times (Parks: ${parks})`);
          });
        } else {
          console.log(`  ✓ No duplicate alert IDs detected`);
        }

        return {
          success: true,
          data: allAlerts,
        };
      } else {
        console.warn('Unexpected API response structure:', Object.keys(data));
        return {
          success: false,
          error: 'Unexpected API response structure',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error fetching ${isFuture ? 'future' : 'current'} alerts:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Fetch both current and future alerts
   */
  public async fetchAllAlerts(): Promise<{
    current: FetchResult<any[]>;
    future: FetchResult<any[]>;
  }> {
    const [current, future] = await Promise.all([
      this.fetchCurrentAlerts(),
      this.fetchFutureAlerts(),
    ]);

    return { current, future };
  }
}
