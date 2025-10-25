import { ArcGISQueryResponse, ArcGISFeature, FetchResult } from '../models/types';

export class GeoDataFetcher {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Fetch all reserve features from ArcGIS REST API
   */
  public async fetchAllReserves(): Promise<FetchResult<ArcGISFeature[]>> {
    try {
      console.log('Fetching reserve geospatial data from ArcGIS...');

      // Fetch in batches to handle large datasets
      const features: ArcGISFeature[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const batchResult = await this.fetchReserveBatch(offset, batchSize);

        if (!batchResult.success || !batchResult.data) {
          return {
            success: false,
            error: batchResult.error || 'Failed to fetch reserve batch',
          };
        }

        features.push(...batchResult.data);

        if (batchResult.data.length < batchSize) {
          hasMore = false;
        } else {
          offset += batchSize;
        }

        console.log(`Fetched ${features.length} reserves so far...`);
      }

      console.log(`Total reserves fetched: ${features.length}`);

      return {
        success: true,
        data: features,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error fetching reserve data:', errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Fetch a batch of reserves with pagination
   */
  private async fetchReserveBatch(offset: number, limit: number): Promise<FetchResult<ArcGISFeature[]>> {
    try {
      // Build query URL for ArcGIS REST API
      // Note: We start with returnGeometry=false to avoid 500 errors
      // You can change this to 'true' later if needed
      const params = new URLSearchParams({
        where: '1=1', // Get all features
        outFields: '*', // Get all fields
        returnGeometry: 'false', // Temporarily disabled due to 500 errors
        f: 'json',
        resultOffset: offset.toString(),
        resultRecordCount: limit.toString(),
        outSR: '4326', // WGS84 coordinate system
      });

      const url = `${this.baseUrl}/query?${params.toString()}`;

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

      if (data.features && Array.isArray(data.features)) {
        return {
          success: true,
          data: data.features,
        };
      } else {
        console.error('Response keys:', Object.keys(data));
        if (data.error) {
          console.error('ArcGIS API Error:', JSON.stringify(data.error, null, 2));
          throw new Error(`ArcGIS API Error: ${data.error.message || JSON.stringify(data.error)}`);
        }
        throw new Error('Invalid response structure from ArcGIS API');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error fetching batch at offset ${offset}:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Fetch reserve by NAME_SHORT
   */
  public async fetchReserveByName(nameShort: string): Promise<FetchResult<ArcGISFeature | null>> {
    try {
      const params = new URLSearchParams({
        where: `NAME_SHORT = '${nameShort.replace(/'/g, "''")}'`, // Escape single quotes
        outFields: '*',
        returnGeometry: 'true',
        f: 'json',
        outSR: '4326',
      });

      const url = `${this.baseUrl}/query?${params.toString()}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: any = await response.json();

      if (data.features && data.features.length > 0) {
        return {
          success: true,
          data: data.features[0],
        };
      } else {
        return {
          success: true,
          data: null,
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Error fetching reserve by name ${nameShort}:`, errorMessage);

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Convert ArcGIS geometry to WKT (Well-Known Text) format
   */
  public geometryToWKT(geometry: any): string | null {
    if (!geometry) return null;

    try {
      // Handle polygon (most common for reserves)
      if (geometry.rings && Array.isArray(geometry.rings)) {
        const rings = geometry.rings.map((ring: number[][]) => {
          const coords = ring.map(([x, y]) => `${x} ${y}`).join(', ');
          return `(${coords})`;
        });

        if (rings.length === 1) {
          return `POLYGON(${rings[0]})`;
        } else {
          return `POLYGON(${rings.join(', ')})`;
        }
      }

      // Handle point
      if (geometry.x !== undefined && geometry.y !== undefined) {
        return `POINT(${geometry.x} ${geometry.y})`;
      }

      // Handle polyline
      if (geometry.paths && Array.isArray(geometry.paths)) {
        const paths = geometry.paths.map((path: number[][]) => {
          const coords = path.map(([x, y]) => `${x} ${y}`).join(', ');
          return coords;
        });

        if (paths.length === 1) {
          return `LINESTRING(${paths[0]})`;
        } else {
          return `MULTILINESTRING(${paths.map((p: string) => `(${p})`).join(', ')})`;
        }
      }

      return null;
    } catch (error) {
      console.error('Error converting geometry to WKT:', error);
      return null;
    }
  }

  /**
   * Calculate centroid from geometry
   */
  public calculateCentroid(geometry: any): { lat: number; lon: number } | null {
    if (!geometry) return null;

    try {
      // For point geometry
      if (geometry.x !== undefined && geometry.y !== undefined) {
        return { lat: geometry.y, lon: geometry.x };
      }

      // For polygon geometry, calculate centroid from rings
      if (geometry.rings && Array.isArray(geometry.rings) && geometry.rings.length > 0) {
        const ring = geometry.rings[0]; // Use outer ring
        let sumX = 0;
        let sumY = 0;
        let count = ring.length;

        for (const [x, y] of ring) {
          sumX += x;
          sumY += y;
        }

        return {
          lat: sumY / count,
          lon: sumX / count,
        };
      }

      return null;
    } catch (error) {
      console.error('Error calculating centroid:', error);
      return null;
    }
  }

  /**
   * Get geometry type as string
   */
  public getGeometryType(geometry: any): string | null {
    if (!geometry) return null;

    if (geometry.rings) return 'Polygon';
    if (geometry.paths) return 'Polyline';
    if (geometry.x !== undefined && geometry.y !== undefined) return 'Point';

    return null;
  }
}
