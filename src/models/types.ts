/**
 * NPWS Alerts API Response Types
 */

// Park information
export interface NPWSPark {
  Name: string;
  Url: string;
  Id: string;
  ItemName: string;
}

// Alert from NPWS API
export interface NPWSAlert {
  ID: string;
  EffectiveFrom: string;
  EffectiveTo: string | null;
  LastReviewed: string;
  Title: string;
  ItemName: string | null;
  Category: string;
  DescriptionHtml: string;
  IsKml: boolean;
}

// Park with alerts
export interface NPWSParkAlert {
  Park: NPWSPark;
  Closed: boolean;
  PartClosed: boolean;
  ClosedAreasCount: number;
  LastReviewed: string;
  EffectiveFrom: string;
  Categories: string[];
  Alerts: NPWSAlert[];
}

// API Response wrapper
export interface AlertsAPIResponse {
  Categories: string[];
  ParkAlerts: NPWSParkAlert[];
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
  alert_id: string;
  park_name: string;
  park_id: string;
  alert_title: string;
  alert_description: string;
  alert_category: string;
  start_date: string;
  end_date: string | null;
  last_reviewed: string;
  park_closed: number;
  park_part_closed: number;
  is_future: number; // 0 for current, 1 for future
  is_active: number; // 0 for inactive, 1 for active
  created_at: string;
  updated_at: string;
}

// Reserve stored in database
export interface ReserveRecord {
  id?: number;
  object_id: number;
  name: string;
  name_short: string;
  location: string | null;
  reserve_type: string | null;
  reserve_no: string | null;
  gaz_area: number | null;
  gis_area: number | null;
  gazettal_date: string | null;
  centroid_lat: number | null;
  centroid_lon: number | null;
  created_at: string;
  updated_at: string;
}

// Park mapping stored in database
export interface ParkMappingRecord {
  id?: number;
  park_id: string;
  park_name: string;
  object_id: number;
  reserve_name: string;
  created_at: string;
  updated_at: string;
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
