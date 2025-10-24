# NPWS Alerts Data Collector

A TypeScript application for capturing and processing NSW National Parks & Wildlife Service (NPWS) alerts data with geospatial information.

## Features

- Automated hourly data capture from NPWS alerts API
- Geospatial data integration from ArcGIS REST services
- SQLite database with SpatiaLite support for geospatial queries
- GeoJSON export capability
- Configurable scheduling with node-cron
- CLI commands for manual operations

## Architecture

```
src/
├── db/
│   ├── database.ts       # Database operations and queries
│   └── schema.ts         # Database schema and initialization
├── services/
│   ├── alertsFetcher.ts  # NPWS alerts API client
│   ├── geoDataFetcher.ts # ArcGIS REST API client
│   ├── dataProcessor.ts  # Data processing and matching
│   └── scheduler.ts      # Cron scheduling
├── models/
│   └── types.ts          # TypeScript interfaces
├── utils/
│   └── logger.ts         # Logging utility
├── config.ts             # Configuration loader
└── index.ts              # Main entry point
```

## Prerequisites

- Node.js 18+ and npm
- (Optional) SpatiaLite extension for advanced geospatial features

## Installation

1. Clone the repository or navigate to the project directory:

```bash
cd npws-alerts
```

2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file from the example:

```bash
cp .env.example .env
```

4. Edit `.env` to customize configuration (optional):

```env
DATABASE_PATH=./data/npws-alerts.db
CRON_SCHEDULE=0 * * * *  # Hourly at minute 0
```

## Usage

### Start with Scheduler (Hourly Updates)

Run the application with automatic hourly updates:

```bash
npm start
```

This will:
1. Perform an initial data sync
2. Start the scheduler for hourly updates
3. Keep running until stopped (Ctrl+C)

### One-Time Sync

Fetch data once and exit:

```bash
npm run fetch-once
```

Or:

```bash
npm start -- --once
```

### View Statistics

Display database statistics and recent sync history:

```bash
npm start -- --stats
```

### Export to GeoJSON

Export alerts with geospatial data to GeoJSON format:

```bash
npm start -- --export ./output/alerts.geojson
```

### Help

View all available commands:

```bash
npm start -- --help
```

## Development

### Build

Compile TypeScript to JavaScript:

```bash
npm run build
```

### Run Development Mode

Run with auto-reload on file changes:

```bash
npm run watch
```

### Run Built Version

After building, run the compiled JavaScript:

```bash
npm start
```

## Database Schema

### Tables

**alerts**
- Stores current and future alerts from NPWS API
- Links to reserves via `reserve_id`
- Tracks alert status, type, dates, and descriptions
- `is_future` field distinguishes between current (0) and future (1) alerts

**reserves**
- Stores geospatial data for NSW national parks and reserves
- Contains geometry data (WKT format), names, and metadata
- Linked by `NAME_SHORT` field to match with alerts

**sync_history**
- Tracks all data synchronization operations
- Records statistics, errors, and duration for each sync

### Key Queries

Get alerts with reserve information:
```sql
SELECT a.*, r.name_short, r.name_long
FROM alerts a
LEFT JOIN reserves r ON a.reserve_id = r.reserve_id;
```

## Data Sources

### NPWS Alerts API

- **Current Alerts**: `https://www.nationalparks.nsw.gov.au/api/AlertsJson/GetAlertListWithCounts/1`
- **Future Alerts**: `https://www.nationalparks.nsw.gov.au/api/AlertsJson/GetAlertListWithCounts/0`

### Geospatial Data

- **ArcGIS REST Service**: `https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Tenure/NPWS_AllManagedLand/MapServer/0`

## Configuration

All configuration is done via environment variables (`.env` file):

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_PATH` | Path to SQLite database file | `./data/npws-alerts.db` |
| `CRON_SCHEDULE` | Cron expression for scheduling | `0 * * * *` (hourly) |
| `NPWS_CURRENT_ALERTS_URL` | API URL for current alerts | See above |
| `NPWS_FUTURE_ALERTS_URL` | API URL for future alerts | See above |
| `NPWS_GEO_DATA_URL` | ArcGIS REST API URL | See above |
| `LOG_LEVEL` | Logging level (debug, info, warn, error) | `info` |

### Cron Schedule Examples

- `0 * * * *` - Every hour at minute 0
- `0 */2 * * *` - Every 2 hours
- `0 9,17 * * *` - Daily at 9 AM and 5 PM
- `0 0 * * *` - Daily at midnight

## Project Structure

```
npws-alerts/
├── src/               # TypeScript source files
├── dist/              # Compiled JavaScript (after build)
├── data/              # SQLite database storage
├── output/            # Export output directory
├── package.json       # Project dependencies
├── tsconfig.json      # TypeScript configuration
├── .env               # Environment configuration
├── .env.example       # Example environment file
└── README.md          # This file
```

## Future Enhancements

- [ ] Web frontend for displaying alerts on a map
- [ ] Alert change notifications
- [ ] Historical data analysis
- [ ] Full SpatiaLite integration for advanced spatial queries
- [ ] API endpoint for querying data
- [ ] Docker containerization

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## Notes

- The application matches alerts to reserves using the `reserve_id` field
- Geospatial data is stored in WKT (Well-Known Text) format
- The database uses WAL mode for better concurrent access
- All sync operations are tracked in `sync_history` table
- Error handling includes retry logic for transient failures
