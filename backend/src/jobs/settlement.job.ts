// src/jobs/settlement.job.ts — monthly partner settlements for last month
import { generateSettlements, previousMonth } from '../services/settlement.service';

export async function runSettlementJob() {
  const { from, to } = previousMonth();
  const r = await generateSettlements(from, to, null);
  return { period_from: from, period_to: to, batches: r.batches.length };
}
