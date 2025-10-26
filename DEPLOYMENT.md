# Deployment Guide

This guide covers deploying the NPWS Alerts application to Coolify.

## Overview

The application runs two processes in a single container:
1. **Data Collector/Scheduler** - Fetches and syncs NPWS alerts data on a schedule (default: hourly)
2. **Web Server** - Serves the API and frontend interface on port 3000

## Prerequisites

- Coolify instance up and running
- Git repository with your code pushed
- Basic understanding of Coolify's interface

## Deployment Steps

### 1. Create a New Application in Coolify

1. Log in to your Coolify dashboard
2. Click **+ New** → **Application**
3. Choose **Public Repository** (if public) or **Private Repository** (if private)
4. Enter your Git repository URL:
   ```
   https://github.com/your-username/npws-alerts.git
   ```
5. Select the branch to deploy (usually `main`)

### 2. Configure Build Settings

In the application settings:

1. **Build Pack**: Select **Dockerfile**
2. **Dockerfile Location**: `./Dockerfile` (default)
3. **Port**: `3000`

### 3. Configure Environment Variables

Add the following environment variables in Coolify's environment settings:

#### Required Variables

```bash
NODE_ENV=production
DATABASE_PATH=/app/data/npws-alerts.db
PORT=3000
CRON_SCHEDULE=0 * * * *
LOG_LEVEL=info
```

#### Optional Variables (Override API URLs)

Only set these if you need to use different API endpoints:

```bash
NPWS_CURRENT_ALERTS_URL=https://www.nationalparks.nsw.gov.au/api/AlertsJson/GetAlertListWithCounts/1
NPWS_FUTURE_ALERTS_URL=https://www.nationalparks.nsw.gov.au/api/AlertsJson/GetAlertListWithCounts/0
NPWS_GEO_DATA_URL=https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Tenure/NPWS_AllManagedLand/MapServer/0/query
```

### 4. Configure Persistent Storage

**IMPORTANT**: The SQLite database needs persistent storage to survive deployments.

1. In your application settings, go to **Storages** or **Persistent Volumes**
2. Add a new persistent volume:
   - **Name**: `npws-data`
   - **Mount Path**: `/app/data`
   - **Size**: 1GB (should be more than enough for the database)

This ensures your database persists across container restarts and redeployments.

### 5. Configure Health Checks (Optional but Recommended)

In Coolify's health check settings:

- **Health Check Path**: `/api/stats`
- **Health Check Port**: `3000`
- **Initial Delay**: 40 seconds (gives time for initial data sync)
- **Interval**: 30 seconds

### 6. Deploy

1. Click **Deploy** or **Save & Deploy**
2. Monitor the build logs
3. Wait for the deployment to complete (first deployment may take 5-10 minutes due to initial data sync)

### 7. Verify Deployment

Once deployed, you can verify the application is working:

1. **Check the frontend**: Visit your application URL (Coolify will provide this)
2. **Check the API**: Visit `https://your-app-url/api/stats`
3. **View logs**: In Coolify, check the application logs to see:
   - Initial data sync completion
   - Scheduler running
   - Web server started

Expected log output:
```
================================================
Starting NPWS Alerts Application
================================================
Node version: v20.x.x
Database path: /app/data/npws-alerts.db
Port: 3000
Cron schedule: 0 * * * *
================================================

Starting data collector/scheduler...
Scheduler started with PID: 123

Starting web server...
Web server started with PID: 124

================================================
Application is running
Web server: http://localhost:3000
================================================
```

## Accessing Your Application

After deployment, Coolify will provide you with a URL like:

```
https://your-app.your-coolify-domain.com
```

### Available Endpoints

- **Frontend**: `https://your-app.your-coolify-domain.com/`
- **API Stats**: `https://your-app.your-coolify-domain.com/api/stats`
- **All Alerts**: `https://your-app.your-coolify-domain.com/api/alerts`
- **Alerts with Reserves**: `https://your-app.your-coolify-domain.com/api/alerts/with-reserves`
- **Reserves**: `https://your-app.your-coolify-domain.com/api/reserves`
- **Unmapped Parks**: `https://your-app.your-coolify-domain.com/api/unmapped-parks`

See the API documentation for more endpoints and query parameters.

## Monitoring and Maintenance

### Viewing Logs

In Coolify:
1. Navigate to your application
2. Click on **Logs**
3. You'll see output from both the scheduler and web server

### Redeploying

To deploy updates:
1. Push your changes to Git
2. In Coolify, click **Redeploy**
3. The application will rebuild and restart
4. Your database will persist thanks to the persistent volume

### Manual Data Sync

If you need to trigger a manual data sync without waiting for the cron schedule:

1. Access the container shell in Coolify
2. Run:
   ```bash
   node dist/index.js --once
   ```

### Database Backup

To backup your SQLite database:

1. Access the container shell in Coolify
2. Run:
   ```bash
   cp /app/data/npws-alerts.db /app/data/backup-$(date +%Y%m%d).db
   ```
3. Or use Coolify's backup features if available for persistent volumes

## Troubleshooting

### Application Not Starting

Check logs for:
- Build errors (missing dependencies, TypeScript compilation issues)
- Environment variable issues
- Database initialization problems

### No Data in Database

- Check that the initial sync completed successfully in the logs
- Verify the NPWS API URLs are accessible
- Check for error messages related to fetching or processing data

### Database Errors After Redeployment

If you updated the database schema:
1. You may need to recreate the database
2. Access container shell
3. Delete the old database: `rm /app/data/npws-alerts.db`
4. Restart the container to trigger a fresh sync

### Web Server Not Responding

- Check that port 3000 is correctly configured
- Verify health check settings
- Check container logs for errors

### Scheduler Not Running

- Verify `CRON_SCHEDULE` environment variable is set correctly
- Check logs for scheduler startup messages
- Ensure both processes started successfully

## Local Testing with Docker

Before deploying to Coolify, you can test locally:

```bash
# Build and run with docker-compose
docker-compose up --build

# View logs
docker-compose logs -f

# Stop
docker-compose down

# Stop and remove volumes (fresh start)
docker-compose down -v
```

Access locally at: `http://localhost:3000`

## Cron Schedule Format

The `CRON_SCHEDULE` environment variable uses standard cron expression format:

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, 0 and 7 are Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

Examples:
- `0 * * * *` - Every hour at minute 0
- `*/30 * * * *` - Every 30 minutes
- `0 */6 * * *` - Every 6 hours
- `0 0 * * *` - Daily at midnight
- `0 9,17 * * *` - Daily at 9am and 5pm

## Environment-Specific Configuration

### Production

```bash
NODE_ENV=production
LOG_LEVEL=info
CRON_SCHEDULE=0 * * * *
```

### Staging/Development

```bash
NODE_ENV=development
LOG_LEVEL=debug
CRON_SCHEDULE=*/15 * * * *  # More frequent updates for testing
```

## Security Considerations

1. **Database Location**: Keep the database in the persistent volume, not in the container filesystem
2. **Environment Variables**: Use Coolify's secret management for sensitive values
3. **HTTPS**: Coolify typically provides automatic HTTPS via Let's Encrypt
4. **Non-Root User**: The Dockerfile runs as non-root user `nodejs` for security
5. **Read-Only Access**: The application only reads from NPWS APIs, no write operations

## Performance Tuning

### Database Size

The SQLite database should remain relatively small:
- ~1000-2000 alerts (current + future)
- ~500-1000 reserves
- Total size: typically < 50MB

### Memory Usage

Expected memory usage:
- Base: ~100-150MB
- During sync: ~200-300MB (peak)
- Recommended: Allocate at least 512MB RAM in Coolify

### CPU Usage

- Minimal during idle
- Spike during hourly sync (fetching and processing data)
- Sync typically completes in 1-2 minutes

## Support and Issues

If you encounter issues:
1. Check application logs in Coolify
2. Verify all environment variables are set correctly
3. Ensure persistent volume is mounted at `/app/data`
4. Check that the NPWS APIs are accessible from your Coolify server

For application-specific issues, check the main README.md file for additional information.
