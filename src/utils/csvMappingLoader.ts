import * as fs from 'fs';
import * as path from 'path';

export interface ManualMapping {
  park_id: string;
  park_name: string;
  object_id: number | null;
  reserve_name: string | null;
  notes?: string;
}

/**
 * Load manual park mappings from CSV file
 * CSV format: park_id,park_name,object_id,reserve_name,notes
 * Lines starting with # are treated as comments
 * Empty object_id means explicitly unmappable (display alert without location)
 */
export function loadManualMappings(csvPath: string): ManualMapping[] {
  // Check if file exists
  if (!fs.existsSync(csvPath)) {
    console.log(`Manual mappings CSV not found at ${csvPath} - skipping`);
    return [];
  }

  console.log(`Loading manual park mappings from ${csvPath}...`);

  try {
    const content = fs.readFileSync(csvPath, 'utf-8');
    const lines = content.split('\n');
    const mappings: ManualMapping[] = [];

    let lineNumber = 0;
    let headerParsed = false;

    for (const line of lines) {
      lineNumber++;
      const trimmedLine = line.trim();

      // Skip empty lines and comments
      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      // Skip header row (first non-comment line)
      if (!headerParsed) {
        headerParsed = true;
        continue;
      }

      // Parse CSV line (simple comma split - assumes no commas in values)
      const parts = trimmedLine.split(',').map(p => p.trim());

      if (parts.length < 2) {
        console.warn(`  Line ${lineNumber}: Invalid format (need at least park_id and park_name) - skipping`);
        continue;
      }

      const park_id = parts[0];
      const park_name = parts[1];
      const object_id_str = parts[2] || '';
      const reserve_name = parts[3] || '';
      const notes = parts[4] || '';

      // Validate park_id is present
      if (!park_id) {
        console.warn(`  Line ${lineNumber}: Missing park_id - skipping`);
        continue;
      }

      // Parse object_id (null if empty or invalid)
      let object_id: number | null = null;
      if (object_id_str) {
        const parsed = parseInt(object_id_str, 10);
        if (!isNaN(parsed)) {
          object_id = parsed;
        }
      }

      const mapping: ManualMapping = {
        park_id,
        park_name,
        object_id,
        reserve_name: reserve_name || null,
        notes: notes || undefined,
      };

      mappings.push(mapping);
    }

    console.log(`  Loaded ${mappings.length} manual mappings from CSV`);
    return mappings;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Error loading manual mappings from ${csvPath}:`, errorMessage);
    return [];
  }
}

/**
 * Get default CSV path relative to project root
 */
export function getDefaultCSVPath(): string {
  // Assumes this file is in src/utils/ and CSV is in data/
  return path.join(__dirname, '../../data/manual-park-mappings.csv');
}
