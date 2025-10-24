/**
 * NPWS Alerts API Response Types
 */

// Alert from NPWS API
export interface NPWSAlert {
  AlertID: number;
  ReserveID: number;
  AlertTitle: string;
  AlertDescription: string;
  AlertType: string;
  AlertStatus: string;
  StartDate: string;
  EndDate: string | null;
  LastModified: string;
  // Add more fields as discovered from API
  [key: string]: any;
}

// API Response wrapper
export interface AlertsAPIResponse {
  Alerts: NPWSAlert[];
  TotalCount: number;
  // Add more fields as discovered from API
  [key: string]: any;
}

/**
 * ArcGIS REST API Response Types (for geospatial data)
 */

// Geometry from ArcGIS
export interface ArcGISGeometry {
  rings?: number[][][]; // Polygon
  paths?: number[][][]; // Polyline
  x?: number; // Point
  y?: number; // Point
  spatialReference?: {
    wkid: number;
    latestWkid?: number;
  };
}

// Feature attributes from ArcGIS
export interface ReserveAttributes {
  OBJECTID: number;
  NAME_SHORT: string;
  NAME_LONG?: string;
  RESERVE_ID?: number;
  AREA_HA?: number;
  GAZETTAL_DATE?: string;
  // Add more fields as discovered from API
  [key: string]: any;
}

// Feature from ArcGIS
export interface ArcGISFeature {
  attributes: ReserveAttributes;
  geometry: ArcGISGeometry;
}

// ArcGIS query response
export interface ArcGISQueryResponse {
  features: ArcGISFeature[];
  geometryType?: string;
  spatialReference?: {
    wkid: number;
    latestWkid?: number;
  };
  fields?: Array<{
    name: string;
    type: string;
    alias?: string;
  }>;
}

/**
 * Database Models
 */

// Alert stored in database
export interface AlertRecord {
  id?: number;
  alert_id: number;
  reserve_id: number;
  alert_title: string;
  alert_description: string;
  alert_type: string;
  alert_status: string;
  start_date: string;
  end_date: string | null;
  last_modified: string;
  is_future: boolean; // 0 for current, 1 for future
  created_at: string;
  updated_at: string;
  raw_data: string; // JSON string of full API response
}

// Reserve stored in database
export interface ReserveRecord {
  id?: number;
  object_id: number;
  name_short: string;
  name_long: string | null;
  reserve_id: number | null;
  area_ha: number | null;
  gazettal_date: string | null;
  geometry_type: string | null;
  created_at: string;
  updated_at: string;
  raw_data: string; // JSON string of full feature data
}

/**
 * Configuration Types
 */

export interface AppConfig {
  databasePath: string;
  cronSchedule: string;
  currentAlertsUrl: string;
  futureAlertsUrl: string;
  geoDataUrl: string;
  logLevel: string;
}

/**
 * Utility Types
 */

export interface FetchResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ProcessingStats {
  alertsFetched: number;
  alertsProcessed: number;
  reservesFetched: number;
  reservesProcessed: number;
  errors: number;
  timestamp: string;
}
