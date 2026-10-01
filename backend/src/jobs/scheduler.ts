// src/jobs/scheduler.ts
// Runs JOBS on their cron schedules (Asia/Kolkata). With several API
// instances, a Redis lock makes each scheduled run happen once. Every run is
// recorded in job_runs (the server, not logs, is the record).
import cron from 'node-cron';
import { query, queryOne } from '../config/database';
import { getRedis } from '../config/redis';
import { logger } from '../config/logger';
import { JOBS, JobDefinition } from './registry';
import { queueNotification } from '../services/notification.service';

const LOCK_TTL_SECONDS = 30 * 60;

// Admins hear when a job starts failing — once per run of failures, not on every
// retry — since a stopped job (refills, licence expiry, recall watch) is silent otherwise
export async function alertFirstFailure(jobName: string, runId: string, message: string) {
  const prev = await queryOne<{ status: string }>(
    `SELECT status FROM job_runs WHERE job_name = $1 AND id <> $2 AND status <> 'running' ORDER BY started_at DESC LIMIT 1`, [jobName, runId]);
  if (prev?.status === 'failed') return false;
  const admins = await query<{ id: string }>(`SELECT id FROM users WHERE role IN ('admin', 'super_admin') AND is_active AND deleted_at IS NULL`);
  for (const a of admins) await queueNotification({ userId: a.id, type: 'job_failed', reportNo: jobName, reason: message.slice(0, 200) });
  return true;
}

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
    await alertFirstFailure(job.name, run!.id, message).catch((e) => logger.error(`Job failure alert not sent: ${(e as Error).message}`));
    return { run_id: run!.id, status: 'failed', error: message };
  } finally {
    await getRedis().del(lockKey);
  }
}

const tasks: cron.ScheduledTask[] = [];

export function stopScheduler(): void {
  for (const t of tasks.splice(0)) t.stop();
}

export function startScheduler(): void {
  if (process.env.DISABLE_SCHEDULER === 'true') {
    logger.warn('Scheduler disabled (DISABLE_SCHEDULER=true)');
    return;
  }
  for (const job of JOBS) {
    tasks.push(cron.schedule(job.cron, () => { void runJob(job); }, { timezone: 'Asia/Kolkata' }));
  }
  logger.info(`Scheduler started: ${JOBS.map((j) => `${j.name} [${j.cron} IST]`).join(', ')}`);
}
