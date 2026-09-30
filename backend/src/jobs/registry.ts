// src/jobs/registry.ts — every scheduled job, its schedule (IST) and runner
import { runDailyLicenceExpiryCheck, runMonthlyReVerification } from '../services/kyc.service';
import { runCreditRemindersJob } from './creditReminders.job';
import { runLowStockJob } from './lowStock.job';

export interface JobDefinition {
  name: string;
  description: string;
  cron: string;                              // Asia/Kolkata
  run: () => Promise<Record<string, unknown>>;
}

export const JOBS: JobDefinition[] = [
  {
    name: 'licence_expiry',
    description: 'Warn buyers before drug licence expiry; pause trade ordering on expiry (C-14)',
    cron: '30 1 * * *',                      // daily 01:30
    run: runDailyLicenceExpiryCheck,
  },
  {
    name: 'gstin_recheck',
    description: 'Re-verify GSTIN of approved B2B accounts; flag inactive ones (C-14)',
    cron: '0 2 1 * *',                       // 1st of month 02:00
    run: runMonthlyReVerification,
  },
  {
    name: 'low_stock',
    description: 'Record low-stock alerts and email the admin digest',
    cron: '0 6 * * *',                       // daily 06:00
    run: runLowStockJob,
  },
  {
    name: 'credit_reminders',
    description: 'Remind B2B buyers 3 days, 1 day and on the day credit is due',
    cron: '0 9 * * *',                       // daily 09:00
    run: runCreditRemindersJob,
  },
];

export function findJob(name: string): JobDefinition | undefined {
  return JOBS.find((j) => j.name === name);
}
