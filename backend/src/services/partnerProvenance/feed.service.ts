// Batch provenance for the live stock feed (Sprint 39, rules.ts): inside the snapshot's
// transaction. Required mode (setting): a Schedule H1 / cold-chain batch with no
// supplier details (sent now or recorded earlier) is not offered — an existing batch
// goes to 0 sellable like any batch the snapshot does not set; a new one is not
// written. Provenance that arrived is recorded once for each written batch.
import { PoolClient } from 'pg';
import type { SnapshotPlan } from '../partnerLiveFeed/plan';
import { missingForRequired, provenanceRequiredFor } from './rules';
import { provenanceRequired, recordProvenanceTx, recordedProvenance } from './provenance.service';

/** Drops writes that the required mode holds back; returns how many batches were held. */
export async function holdBatchesWithoutProvenance(c: PoolClient, plan: SnapshotPlan): Promise<number> {
  if (!plan.writes.length || !(await provenanceRequired(c))) return 0;
  const productIds = [...new Set(plan.writes.map((w) => w.productId))];
  const products = new Map((await c.query(
    `SELECT id, drug_schedule, COALESCE(cold_chain, FALSE) AS cold_chain FROM products WHERE id = ANY($1::uuid[])`, [productIds])).rows
    .map((p: any) => [p.id, p]));
  const recorded = await recordedProvenance(c, plan.writes.map((w) => w.inventoryId).filter(Boolean) as string[]);
  let held = 0;
  plan.writes = plan.writes.filter((w) => {
    const p = products.get(w.productId);
    if (!p || !provenanceRequiredFor(p)) return true;
    if (!missingForRequired((w.inventoryId && recorded.get(w.inventoryId)) || w.provenance || null).length) return true;
    held++;
    if (w.inventoryId) plan.zero.push(w.inventoryId);
    return false;
  });
  return held;
}

/** After the ledger is written: record what the snapshot said about each batch's supplier. */
export async function recordFeedProvenance(c: PoolClient, partnerId: string, plan: SnapshotPlan, importId: string): Promise<number> {
  let recorded = 0;
  for (const w of plan.writes) {
    if (!w.provenance) continue;
    const inv = w.inventoryId ?? (await c.query(
      `SELECT id FROM partner_inventory WHERE partner_product_id = $1 AND batch_number = $2`, [w.ppId, w.batch_number])).rows[0]?.id;
    if (!inv) continue;
    if ((await recordProvenanceTx(c, { partnerId, inventoryId: inv, provenance: w.provenance, source: 'feed', importId })) === 'recorded') recorded++;
  }
  return recorded;
}
