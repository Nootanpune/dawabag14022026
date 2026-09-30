// src/jobs/scheduler.ts
// Runs JOBS on their cron schedules (Asia/Kolkata). With several API
// instances, a Redis lock makes each scheduled run happen once. Every run is
// recorded in job_runs (the server, not logs, is the record).
import cron from 'node-cron';
import { query, queryOne } from '../config/database';
import { getRedis } from '../config/redis';
import { logger } from '../config/logger';
import { JOBS, JobDefinition } from './registry';

const LOCK_TTL_SECONDS = 30 * 60;

export async function runJob(job: JobDefinition, triggeredBy: string | null = null) {
  const lockKey = `job-lock:${job.name}`;
  const locked = await getRedis().set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
  if (!locked) return { skipped: true, reason: 'already running' };

  const run = await queryOne<{ id: string }>(
    `INSERT INTO job_runs (job_name, triggered_by) VALUES ($1, $2) RETURNING id`,
    [job.name, triggeredBy]
  );
  try {
    const summary = await job.run();
    await query(
      `UPDATE job_runs SET status = 'succeeded', finished_at = NOW(), summary = $2 WHERE id = $1`,
      [run!.id, JSON.stringify(summary)]
    );
    logger.info(`Job ${job.name} succeeded: ${JSON.stringify(summary)}`);
    return { run_id: run!.id, status: 'succeeded', summary };
  } catch (err) {
    const message = (err as Error).message;
    await query(
      `UPDATE job_runs SET status = 'failed', finished_at = NOW(), error = $2 WHERE id = $1`,
      [run!.id, message.slice(0, 2000)]
    );
    logger.error(`Job ${job.name} failed: ${message}`);
    return { run_id: run!.id, status: 'failed', error: message };
  } finally {
    await getRedis().del(lockKey);
  }
}

export function startScheduler(): void {
  if (process.env.DISABLE_SCHEDULER === 'true') {
    logger.warn('Scheduler disabled (DISABLE_SCHEDULER=true)');
    return;
  }
  for (const job of JOBS) {
    cron.schedule(job.cron, () => { void runJob(job); }, { timezone: 'Asia/Kolkata' });
  }
  logger.info(`Scheduler started: ${JOBS.map((j) => `${j.name} [${j.cron} IST]`).join(', ')}`);
}
