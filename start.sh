#!/bin/sh

# Startup script for NPWS Alerts
# Runs both the data collector (scheduler) and web server

echo "================================================"
echo "Starting NPWS Alerts Application"
echo "================================================"
echo "Node version: $(node --version)"
echo "Database path: ${DATABASE_PATH:-/app/data/npws-alerts.db}"
echo "Port: ${PORT:-3000}"
echo "Cron schedule: ${CRON_SCHEDULE:-0 * * * *}"
echo "================================================"
echo ""

# Trap signals for graceful shutdown
trap 'echo "Received SIGTERM, shutting down..."; kill $SCHEDULER_PID $WEB_PID; exit 0' SIGTERM
trap 'echo "Received SIGINT, shutting down..."; kill $SCHEDULER_PID $WEB_PID; exit 0' SIGINT

# Start the scheduler in the background
echo "Starting data collector/scheduler..."
node dist/index.js &
SCHEDULER_PID=$!
echo "Scheduler started with PID: $SCHEDULER_PID"

# Give scheduler a moment to start
sleep 2

# Start the web server in the background
echo "Starting web server..."
node dist/web/server.js &
WEB_PID=$!
echo "Web server started with PID: $WEB_PID"

echo ""
echo "================================================"
echo "Application is running"
echo "Web server: http://localhost:${PORT:-3000}"
echo "================================================"
echo ""

# Wait for both processes
wait $SCHEDULER_PID $WEB_PID
