# Quick Start Guide

Get started with the NPWS Alerts Data Collector in just a few steps.

## 1. Install Dependencies

```bash
npm install
```

This will install all required packages including:
- TypeScript and Node.js types
- better-sqlite3 for database operations
- node-cron for scheduling
- dotenv for configuration

## 2. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

The defaults should work fine for most cases. The default configuration:
- Stores database in `./data/npws-alerts.db`
- Runs hourly updates at minute 0
- Uses official NPWS API endpoints

## 3. Run Your First Sync

Fetch data once to test everything works:

```bash
npm run fetch-once
```

This will:
1. Create the SQLite database
2. Fetch reserve geospatial data from ArcGIS
3. Fetch current and future alerts from NPWS
4. Match alerts to reserves
5. Display statistics

Expected output:
```
Initializing database schema...
Created alerts table
Created reserves table
Created sync_history table
...
Fetching reserve geospatial data from ArcGIS...
Fetched 1000 reserves so far...
Total reserves fetched: 1234
...
Fetched 45 current alerts
Fetched 12 future alerts
...
Sync completed successfully
```

## 4. View the Data

Check what was captured:

```bash
npm start -- --stats
```

You'll see:
- Total number of alerts and reserves
- Last sync timestamp
- Recent sync history with details

## 5. Export to GeoJSON

Create a GeoJSON file for use in mapping applications:

```bash
npm start -- --export ./output/alerts.geojson
```

This creates a GeoJSON FeatureCollection with all alerts and their associated reserve geometries.

## 6. Start Scheduled Updates

Run with automatic hourly updates:

```bash
npm start
```

The application will:
1. Run an initial sync
2. Start a cron job for hourly updates
3. Continue running until you stop it (Ctrl+C)

## Next Steps

### Query the Database

The SQLite database is at `./data/npws-alerts.db`. You can query it with any SQLite client:

```bash
sqlite3 ./data/npws-alerts.db

# Example queries:
SELECT COUNT(*) FROM alerts;
SELECT COUNT(*) FROM reserves;
SELECT alert_title, reserve_name_short FROM alerts
  JOIN reserves ON alerts.reserve_id = reserves.reserve_id
  LIMIT 10;
```

### Customize the Schedule

Edit `.env` to change the update frequency:

```env
# Run every 6 hours
CRON_SCHEDULE=0 */6 * * *

# Run twice daily at 9 AM and 5 PM
CRON_SCHEDULE=0 9,17 * * *

# Run daily at midnight
CRON_SCHEDULE=0 0 * * *
```

### Use in Your Own Code

```typescript
import { NPWSAlertsApp } from './dist/index.js';

const app = new NPWSAlertsApp();
await app.runOnce();
```

### View Logs

The application logs all operations to console. Redirect to a file if needed:

```bash
npm start > logs/app.log 2>&1
```

## Troubleshooting

### Database Locked Error

If you get "database is locked" errors:
- Make sure only one instance is running
- The database uses WAL mode which helps with concurrent access

### API Timeout

If fetching data times out:
- Check your internet connection
- The ArcGIS API may take time for large datasets
- Consider fetching during off-peak hours

### Missing Dependencies

If you get module not found errors:
- Run `npm install` again
- Delete `node_modules` and `package-lock.json`, then reinstall

### TypeScript Errors

If you see TypeScript compilation errors:
- Check Node.js version: `node --version` (requires 18+)
- Rebuild: `npm run build`

## Common Use Cases

### 1. Daily Batch Job

Set up a system cron job to run daily:

```bash
0 0 * * * cd /path/to/npws-alerts && npm run fetch-once >> /var/log/npws-alerts.log 2>&1
```

### 2. On-Demand Updates

Keep the scheduler running in the background:

```bash
# Using screen or tmux
screen -S npws-alerts
npm start
# Detach with Ctrl+A, D

# Or using nohup
nohup npm start > logs/app.log 2>&1 &
```

### 3. Development Testing

Use watch mode for development:

```bash
npm run watch
```

Files will automatically reload when you make changes.

## What's Next?

You now have a working NPWS alerts data capture system. The data is ready to be:
- Displayed on a web map
- Queried via an API
- Analyzed for trends
- Integrated with other systems

See README.md for more detailed documentation and future enhancement ideas.
