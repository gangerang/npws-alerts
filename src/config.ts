import * as dotenv from 'dotenv';
import { AppConfig } from './models/types';
import * as path from 'path';

// Load environment variables from .env file
dotenv.config();

/**
 * Load application configuration from environment variables
 */
export function loadConfig(): AppConfig {
  const config: AppConfig = {
    databasePath: process.env.DATABASE_PATH || './data/npws-alerts.db',
    cronSchedule: process.env.CRON_SCHEDULE || '0 * * * *', // Hourly by default
    currentAlertsUrl:
      process.env.NPWS_CURRENT_ALERTS_URL ||
      'https://www.nationalparks.nsw.gov.au/api/AlertsJson/GetAlertListWithCounts/1',
    futureAlertsUrl:
      process.env.NPWS_FUTURE_ALERTS_URL ||
      'https://www.nationalparks.nsw.gov.au/api/AlertsJson/GetAlertListWithCounts/0',
    geoDataUrl:
      process.env.NPWS_GEO_DATA_URL ||
      'https://mapprod3.environment.nsw.gov.au/arcgis/rest/services/Tenure/NPWS_AllManagedLand/MapServer/0',
    logLevel: process.env.LOG_LEVEL || 'info',
  };

  return config;
}

/**
 * Validate configuration
 */
export function validateConfig(config: AppConfig): void {
  const errors: string[] = [];

  if (!config.databasePath) {
    errors.push('DATABASE_PATH is required');
  }

  if (!config.cronSchedule) {
    errors.push('CRON_SCHEDULE is required');
  }

  if (!config.currentAlertsUrl) {
    errors.push('NPWS_CURRENT_ALERTS_URL is required');
  }

  if (!config.futureAlertsUrl) {
    errors.push('NPWS_FUTURE_ALERTS_URL is required');
  }

  if (!config.geoDataUrl) {
    errors.push('NPWS_GEO_DATA_URL is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Print configuration (for debugging)
 */
export function printConfig(config: AppConfig): void {
  console.log('Application Configuration:');
  console.log('='.repeat(60));
  console.log(`Database Path: ${config.databasePath}`);
  console.log(`Cron Schedule: ${config.cronSchedule}`);
  console.log(`Current Alerts URL: ${config.currentAlertsUrl}`);
  console.log(`Future Alerts URL: ${config.futureAlertsUrl}`);
  console.log(`Geo Data URL: ${config.geoDataUrl}`);
  console.log(`Log Level: ${config.logLevel}`);
  console.log('='.repeat(60));
}
