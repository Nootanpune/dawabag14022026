// src/controllers/jobs.controller.ts — scheduled jobs: status and manual runs
import { Request, Response, NextFunction } from 'express';
import { query } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAudit } from '../utils/audit';
import { JOBS, findJob } from '../jobs/registry';
import { runJob } from '../jobs/scheduler';

// GET /admin/jobs — definitions with their last 5 runs
export async function listJobs(_req: Request, res: Response, next: NextFunction) {
  try {
    const runs = await query<any>(
      `SELECT * FROM (
         SELECT job_name, id, status, started_at, finished_at, summary, error, triggered_by,
                ROW_NUMBER() OVER (PARTITION BY job_name ORDER BY started_at DESC) AS rn
         FROM job_runs) r
       WHERE rn <= 5 ORDER BY started_at DESC`
    );
    res.json({
      success: true,
      data: {
        timezone: 'Asia/Kolkata',
        jobs: JOBS.map((j) => ({
          name: j.name, description: j.description, cron: j.cron,
          recent_runs: runs.filter((r) => r.job_name === j.name).map(({ rn: _rn, job_name: _n, ...r }) => r),
        })),
      },
    });
  } catch (err) { next(err); }
}

// POST /admin/jobs/:name/run — run now (super admin)
export async function runJobNow(req: Request, res: Response, next: NextFunction) {
  try {
    const job = findJob(req.params.name);
    if (!job) throw new AppError('Unknown job', 404);
    await writeAudit({ userId: null, action: 'job_run_manual', performedBy: req.user!.id, newValue: { job: job.name } });
    res.json({ success: true, data: await runJob(job, req.user!.id) });
  } catch (err) { next(err); }
}
