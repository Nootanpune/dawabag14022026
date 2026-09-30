// src/jobs/registry.ts — every scheduled job, its schedule (IST) and runner
import { runDailyLicenceExpiryCheck, runMonthlyReVerification } from '../services/kyc.service';
import { runCreditRemindersJob } from './creditReminders.job';
import { runLowStockJob } from './lowStock.job';
import { runSettlementJob } from './settlement.job';
import { runRefillOrdersJob, runRefillRemindersJob } from './refill.job';
import { runLicenceRegisterAlerts } from '../services/licence.service';

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
  {
    name: 'partner_settlements',
    description: 'Build last month\'s partner settlements: commission, fees, GST on fees, TCS, TDS (C-32)',
    cron: '0 3 1 * *',                       // 1st of month 03:00
    run: runSettlementJob,
  },
  {
    name: 'refill_orders',
    description: 'Place refill orders due today; charge active mandates (no prescription lines)',
    cron: '0 7 * * *',                       // daily 07:00
    run: runRefillOrdersJob,
  },
  {
    name: 'refill_reminders',
    description: 'Remind buyers before a refill (pre-debit notice for mandates)',
    cron: '0 8 * * *',                       // daily 08:00
    run: runRefillRemindersJob,
  },
  {
    name: 'licence_register_alerts',
    description: "Alert the renewal owner and admins 60, 30 and 7 days before Dawabag's own licences expire (C-07)",
    cron: '15 9 * * *',                      // daily 09:15
    run: runLicenceRegisterAlerts,
  },
];

export function findJob(name: string): JobDefinition | undefined {
  return JOBS.find((j) => j.name === name);
}
