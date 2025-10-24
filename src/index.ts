#!/usr/bin/env node

import { loadConfig, validateConfig, printConfig } from './config';
import { NPWSDatabase } from './db/database';
import { AlertsFetcher } from './services/alertsFetcher';
import { GeoDataFetcher } from './services/geoDataFetcher';
import { DataProcessor } from './services/dataProcessor';
import { Scheduler } from './services/scheduler';
import * as fs from 'fs';

/**
 * Main application class
 */
class NPWSAlertsApp {
  private config = loadConfig();
  private db: NPWSDatabase;
  private alertsFetcher: AlertsFetcher;
  private geoDataFetcher: GeoDataFetcher;
  private dataProcessor: DataProcessor;
  private scheduler: Scheduler;

  constructor() {
    // Validate configuration
    validateConfig(this.config);

    // Initialize services
    this.db = new NPWSDatabase(this.config.databasePath);
    this.alertsFetcher = new AlertsFetcher(
      this.config.currentAlertsUrl,
      this.config.futureAlertsUrl
    );
    this.geoDataFetcher = new GeoDataFetcher(this.config.geoDataUrl);
    this.dataProcessor = new DataProcessor(
      this.db,
      this.alertsFetcher,
      this.geoDataFetcher
    );
    this.scheduler = new Scheduler(this.config.cronSchedule, this.dataProcessor);
  }

  /**
   * Start the application with scheduler
   */
  public async start(): Promise<void> {
    console.log('NPWS Alerts Data Collector');
    console.log('='.repeat(60));
    printConfig(this.config);
    console.log('');

    // Run initial sync
    console.log('Running initial data sync...');
    await this.dataProcessor.syncAll();

    // Start scheduler
    this.scheduler.start();

    console.log('\nApplication is running. Press Ctrl+C to stop.');

    // Handle graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Run a one-time sync without starting scheduler
   */
  public async runOnce(): Promise<void> {
    console.log('NPWS Alerts Data Collector - One-time Sync');
    console.log('='.repeat(60));
    printConfig(this.config);
    console.log('');

    await this.dataProcessor.syncAll();

    console.log('\nSync completed. Exiting...');
    this.cleanup();
    process.exit(0);
  }

  /**
   * Show current statistics
   */
  public async showStats(): Promise<void> {
    console.log('NPWS Alerts Database Statistics');
    console.log('='.repeat(60));

    const stats = this.dataProcessor.getStats();
    console.log(`Total Alerts: ${stats.alerts}`);
    console.log(`Total Reserves: ${stats.reserves}`);
    console.log(`Last Sync: ${stats.lastSync || 'Never'}`);

    console.log('\nRecent Sync History:');
    const history = this.dataProcessor.getSyncHistory(5);
    history.forEach((sync: any) => {
      console.log(`\n${sync.sync_type} - ${sync.sync_status}`);
      console.log(`  Started: ${sync.started_at}`);
      console.log(`  Duration: ${sync.duration_ms}ms`);
      console.log(`  Alerts: ${sync.alerts_fetched} fetched, ${sync.alerts_processed} processed`);
      console.log(`  Reserves: ${sync.reserves_fetched} fetched, ${sync.reserves_processed} processed`);
      if (sync.errors > 0) {
        console.log(`  Errors: ${sync.errors}`);
      }
    });

    this.cleanup();
    process.exit(0);
  }

  /**
   * Export data as GeoJSON
   */
  public async exportGeoJSON(outputPath: string): Promise<void> {
    console.log('Exporting data as GeoJSON...');

    const geojson = this.dataProcessor.exportAsGeoJSON();
    fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));

    console.log(`GeoJSON exported to: ${outputPath}`);
    console.log(`Features: ${geojson.features.length}`);

    this.cleanup();
    process.exit(0);
  }

  /**
   * Setup shutdown handlers for graceful exit
   */
  private setupShutdownHandlers(): void {
    const shutdown = (signal: string) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      this.cleanup();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    console.log('Cleaning up...');
    this.scheduler.stop();
    this.db.close();
    console.log('Cleanup complete');
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const app = new NPWSAlertsApp();

  try {
    switch (command) {
      case '--once':
      case '-o':
        // Run one-time sync
        await app.runOnce();
        break;

      case '--stats':
      case '-s':
        // Show statistics
        await app.showStats();
        break;

      case '--export':
      case '-e':
        // Export as GeoJSON
        const outputPath = args[1] || './output/alerts.geojson';
        await app.exportGeoJSON(outputPath);
        break;

      case '--help':
      case '-h':
        // Show help
        console.log('NPWS Alerts Data Collector');
        console.log('\nUsage:');
        console.log('  npm start              - Start with scheduler (hourly updates)');
        console.log('  npm run fetch-once     - Run one-time sync and exit');
        console.log('  npm start -- --stats   - Show database statistics');
        console.log('  npm start -- --export [path] - Export data as GeoJSON');
        console.log('  npm start -- --help    - Show this help message');
        console.log('\nEnvironment variables (see .env.example):');
        console.log('  DATABASE_PATH          - Path to SQLite database');
        console.log('  CRON_SCHEDULE          - Cron expression for scheduling');
        console.log('  NPWS_CURRENT_ALERTS_URL - API URL for current alerts');
        console.log('  NPWS_FUTURE_ALERTS_URL  - API URL for future alerts');
        console.log('  NPWS_GEO_DATA_URL      - ArcGIS REST API URL for reserves');
        console.log('  LOG_LEVEL              - Logging level (info, debug, error)');
        process.exit(0);
        break;

      default:
        // Start with scheduler
        await app.start();
        break;
    }
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { NPWSAlertsApp };
