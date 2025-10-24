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
   */
  private async fetchAlerts(url: string, isFuture: boolean): Promise<FetchResult<NPWSAlert[]>> {
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

      const data = await response.json();

      // Handle different possible response structures
      let alerts: NPWSAlert[] = [];

      if (Array.isArray(data)) {
        // Response is directly an array of alerts
        alerts = data;
      } else if (data.Alerts && Array.isArray(data.Alerts)) {
        // Response is wrapped in an object with Alerts property
        alerts = data.Alerts;
      } else if (data.alerts && Array.isArray(data.alerts)) {
        // Response might have lowercase property name
        alerts = data.alerts;
      } else {
        console.warn('Unexpected API response structure:', Object.keys(data));
        // Try to extract alerts from whatever structure we got
        alerts = this.extractAlertsFromResponse(data);
      }

      console.log(`Fetched ${alerts.length} ${isFuture ? 'future' : 'current'} alerts`);

      return {
        success: true,
        data: alerts,
      };
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
   * Try to extract alerts from unknown response structure
   */
  private extractAlertsFromResponse(data: any): NPWSAlert[] {
    // Look for array properties in the response
    for (const key of Object.keys(data)) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        // Check if first item looks like an alert (has expected properties)
        const firstItem = data[key][0];
        if (this.looksLikeAlert(firstItem)) {
          console.log(`Found alerts in property: ${key}`);
          return data[key];
        }
      }
    }

    console.warn('Could not find alerts array in response');
    return [];
  }

  /**
   * Check if an object looks like an alert
   */
  private looksLikeAlert(obj: any): boolean {
    return (
      obj &&
      typeof obj === 'object' &&
      ('AlertID' in obj || 'alertId' in obj || 'id' in obj) &&
      ('AlertTitle' in obj || 'title' in obj)
    );
  }

  /**
   * Fetch both current and future alerts
   */
  public async fetchAllAlerts(): Promise<{
    current: FetchResult<NPWSAlert[]>;
    future: FetchResult<NPWSAlert[]>;
  }> {
    const [current, future] = await Promise.all([
      this.fetchCurrentAlerts(),
      this.fetchFutureAlerts(),
    ]);

    return { current, future };
  }

  /**
   * Validate alert data structure
   */
  public validateAlert(alert: any): alert is NPWSAlert {
    return (
      alert &&
      typeof alert === 'object' &&
      (typeof alert.AlertID === 'number' || typeof alert.alertId === 'number') &&
      (typeof alert.ReserveID === 'number' || typeof alert.reserveId === 'number')
    );
  }

  /**
   * Normalize alert field names (handle different casing)
   */
  public normalizeAlert(alert: any): NPWSAlert {
    return {
      AlertID: alert.AlertID || alert.alertId || alert.id,
      ReserveID: alert.ReserveID || alert.reserveId || alert.reserve_id,
      AlertTitle: alert.AlertTitle || alert.title || alert.alert_title || '',
      AlertDescription: alert.AlertDescription || alert.description || alert.alert_description || '',
      AlertType: alert.AlertType || alert.type || alert.alert_type || '',
      AlertStatus: alert.AlertStatus || alert.status || alert.alert_status || '',
      StartDate: alert.StartDate || alert.startDate || alert.start_date || '',
      EndDate: alert.EndDate || alert.endDate || alert.end_date || null,
      LastModified: alert.LastModified || alert.lastModified || alert.last_modified || new Date().toISOString(),
      ...alert, // Preserve any additional fields
    };
  }
}
