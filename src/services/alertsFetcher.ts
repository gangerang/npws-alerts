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

        for (const parkAlert of data.ParkAlerts) {
          const park = parkAlert.Park;
          const alerts = parkAlert.Alerts || [];

          // Add park information to each alert
          for (const alert of alerts) {
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
