import * as cron from 'node-cron';
import { DataProcessor } from './dataProcessor';

export class Scheduler {
  private cronSchedule: string;
  private dataProcessor: DataProcessor;
  private task: cron.ScheduledTask | null = null;
  private isRunning: boolean = false;

  constructor(cronSchedule: string, dataProcessor: DataProcessor) {
    this.cronSchedule = cronSchedule;
    this.dataProcessor = dataProcessor;
  }

  /**
   * Start the scheduled task
   */
  public start(): void {
    if (this.task) {
      console.log('Scheduler is already running');
      return;
    }

    // Validate cron expression
    if (!cron.validate(this.cronSchedule)) {
      throw new Error(`Invalid cron expression: ${this.cronSchedule}`);
    }

    console.log(`Starting scheduler with cron expression: ${this.cronSchedule}`);
    console.log(`Next run will be at: ${this.getNextRunTime()}`);

    this.task = cron.schedule(this.cronSchedule, async () => {
      await this.runSync();
    });

    console.log('Scheduler started successfully');
  }

  /**
   * Stop the scheduled task
   */
  public stop(): void {
    if (this.task) {
      this.task.stop();
      this.task = null;
      console.log('Scheduler stopped');
    } else {
      console.log('Scheduler is not running');
    }
  }

  /**
   * Run a sync operation
   */
  private async runSync(): Promise<void> {
    if (this.isRunning) {
      console.log('Sync already in progress, skipping this run');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('\n' + '='.repeat(60));
      console.log(`Starting scheduled sync at ${new Date().toISOString()}`);
      console.log('='.repeat(60));

      const stats = await this.dataProcessor.syncAll();

      const duration = Date.now() - startTime;
      console.log('\n' + '='.repeat(60));
      console.log('Sync completed successfully');
      console.log(`Duration: ${duration}ms`);
      console.log('Stats:', JSON.stringify(stats, null, 2));
      console.log(`Next run at: ${this.getNextRunTime()}`);
      console.log('='.repeat(60) + '\n');
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('\n' + '='.repeat(60));
      console.error('Sync failed with error:');
      console.error(error);
      console.error(`Duration: ${duration}ms`);
      console.error(`Next run at: ${this.getNextRunTime()}`);
      console.error('='.repeat(60) + '\n');
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run sync immediately (outside of schedule)
   */
  public async runNow(): Promise<void> {
    console.log('Running sync immediately...');
    await this.runSync();
  }

  /**
   * Get the next scheduled run time
   */
  private getNextRunTime(): string {
    // Parse cron expression to show next run time
    // This is a simple estimation - cron expressions can be complex
    const parts = this.cronSchedule.split(' ');

    if (parts.length === 5) {
      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

      // Simple case: hourly at minute 0
      if (minute === '0' && hour === '*') {
        const now = new Date();
        const next = new Date(now);
        next.setMinutes(0, 0, 0);
        next.setHours(now.getHours() + 1);
        return next.toISOString();
      }

      // For other patterns, just show the schedule
      return `Cron schedule: ${this.cronSchedule}`;
    }

    return 'Unknown';
  }

  /**
   * Get scheduler status
   */
  public getStatus(): {
    isScheduled: boolean;
    isRunning: boolean;
    cronSchedule: string;
    nextRun: string;
  } {
    return {
      isScheduled: this.task !== null,
      isRunning: this.isRunning,
      cronSchedule: this.cronSchedule,
      nextRun: this.getNextRunTime(),
    };
  }

  /**
   * Update cron schedule (requires restart)
   */
  public updateSchedule(newSchedule: string): void {
    if (!cron.validate(newSchedule)) {
      throw new Error(`Invalid cron expression: ${newSchedule}`);
    }

    const wasRunning = this.task !== null;

    this.stop();
    this.cronSchedule = newSchedule;

    if (wasRunning) {
      this.start();
      console.log(`Schedule updated to: ${newSchedule}`);
    }
  }
}
