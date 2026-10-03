// A pharmacist's disposition of a cold-chain excursion (Sprint 40, rules.ts; C-25, C-28).
//   Dawabag's batch: a Dawabag pharmacist (pharmacist_rx) with a valid registration.
//   Partner's batch: the partner's own registered pharmacist (it is the licensee),
//   named on the form like the partner's shipment check.
// release   → the batch is sellable again (if no other excursion is open);
// quarantine→ still held, waits for release or destruction;
// destroy   → held for good; for Dawabag's batch the free stock is raised as a
//             write-off (stock adjustment, reason damaged) that a second person approves
//             and the destruction register completes (C-46 two people).
import { PoolClient } from 'pg';
import { withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { createAdjustment } from '../stock/adjustment.service';
import { assertPartnerRegistrationValid, assertStaffRegistrationValid } from '../pharmacistRegistration/gate.service';
import { DispositionInput, Disposition, dispositionProblems } from './rules';

type Actor = { kind: 'staff'; userId: string; role: string } | { kind: 'partner'; userId: string; partnerId: string; vendorPharmacistId: string };

async function lockExcursion(c: PoolClient, excursionId: string, actor: Actor) {
  const ex = (await c.query(
    `SELECT r.id, r.event_kind, r.cold_chain, r.batch_id, r.partner_inventory_id, r.partner_id, r.batch_number, p.name AS product_name
     FROM gdp_records r JOIN products p ON p.id = r.product_id WHERE r.id = $1`, [excursionId])).rows[0];
  if (!ex || ex.event_kind !== 'excursion') throw new AppError('Excursion not found', 404);
  // Sprint 41 review: another partner's excursion is "not found" BEFORE anything is locked or said about it
  if (actor.kind === 'partner' && (ex.partner_id !== actor.partnerId || !ex.partner_inventory_id)) throw new AppError('Excursion not found', 404);
  // One decision at a time per batch
  if (ex.batch_id) await c.query(`SELECT id FROM inventory_batches WHERE id = $1 FOR UPDATE`, [ex.batch_id]);
  else await c.query(`SELECT id FROM partner_inventory WHERE id = $1 FOR UPDATE`, [ex.partner_inventory_id]);
  const decided = (await c.query(`SELECT disposition FROM gdp_records WHERE excursion_id = $1 AND disposition IN ('release', 'destroy') LIMIT 1`, [excursionId])).rows[0];
  if (decided) throw new AppError(`This excursion has already been decided (${decided.disposition})`, 409);
  return ex;
}

async function pharmacistOf(c: PoolClient, actor: Actor, ex: any) {
  if (actor.kind === 'staff') {
    if (ex.partner_inventory_id) throw new AppError("A partner's batch is decided by the partner's own registered pharmacist (it holds the licence)", 403);
    if (actor.role !== 'pharmacist_rx') throw new AppError('Only a Dawabag pharmacist can decide what happens to a batch after an excursion', 403);
    const u = (await c.query(
      `SELECT u.pharmacist_reg_no, up.full_name FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = $1`, [actor.userId])).rows[0];
    if (!u?.pharmacist_reg_no) throw new AppError('Add your pharmacy council registration number first', 403, true, 'PHARMACIST_REGISTRATION_INVALID');
    await assertStaffRegistrationValid(c, actor.userId, u.pharmacist_reg_no);
    return { pharmacist_user_id: actor.userId, vendor_pharmacist_id: null, name: u.full_name || 'Dawabag pharmacist', reg: u.pharmacist_reg_no };
  }
  if (ex.partner_id !== actor.partnerId || !ex.partner_inventory_id) throw new AppError('Excursion not found', 404);
  const vp = (await c.query(`SELECT id, full_name, registration_no, is_active FROM vendor_pharmacists WHERE id = $1 AND vendor_id = $2`,
    [actor.vendorPharmacistId, actor.partnerId])).rows[0];
  if (!vp || !vp.is_active) throw new AppError('Choose one of your registered pharmacists', 400);
  await assertPartnerRegistrationValid(c, vp.id);
  return { pharmacist_user_id: null, vendor_pharmacist_id: vp.id, name: vp.full_name, reg: vp.registration_no };
}

export async function decideExcursion(actor: Actor, excursionId: string, input: DispositionInput) {
  const problems = dispositionProblems(input);
  if (problems.length) throw new AppError(problems.join('; '), 400);
  const disposition = input.disposition as Disposition;
  const justification = String(input.justification).trim();
  return withTransaction(async (c) => {
    const ex = await lockExcursion(c, excursionId, actor);
    const ph = await pharmacistOf(c, actor, ex);
    let adjustment: { id: string; adjustment_no: string } | null = null;
    if (disposition === 'destroy' && ex.batch_id) {
      const b = (await c.query(`SELECT quantity_available - quantity_reserved AS free FROM inventory_batches WHERE id = $1`, [ex.batch_id])).rows[0];
      if (Number(b.free) > 0) {
        adjustment = await createAdjustment(c, actor.userId, { batch_id: ex.batch_id, quantity_delta: -Number(b.free), reason: 'damaged',
          notes: `Cold-chain excursion: pharmacist ${ph.name} (${ph.reg}) decided to destroy. ${justification}`.slice(0, 2000) });
      }
    }
    const rec = (await c.query(
      `INSERT INTO gdp_records (batch_id, partner_inventory_id, product_id, batch_number, event_kind, excursion_id, disposition, justification,
         pharmacist_user_id, vendor_pharmacist_id, pharmacist_name, pharmacist_reg_no, stock_adjustment_id, source, recorded_by)
       VALUES ($1, $2, '00000000-0000-0000-0000-000000000000', '', 'excursion_disposition', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id, recorded_at`,
      [ex.batch_id, ex.partner_inventory_id, excursionId, disposition, justification, ph.pharmacist_user_id, ph.vendor_pharmacist_id,
       ph.name, ph.reg, adjustment?.id ?? null, actor.kind, actor.userId])).rows[0];
    const status = (await c.query(ex.batch_id ? `SELECT gdp_status FROM inventory_batches WHERE id = $1` : `SELECT gdp_status FROM partner_inventory WHERE id = $1`,
      [ex.batch_id ?? ex.partner_inventory_id])).rows[0].gdp_status as string;
    await writeAuditTx(c, { userId: null, action: 'gdp_excursion_decided', performedBy: actor.userId,
      newValue: { excursion_id: excursionId, disposition_id: rec.id, disposition, batch_number: ex.batch_number, product: ex.product_name,
        pharmacist_name: ph.name, pharmacist_reg_no: ph.reg, stock_adjustment_id: adjustment?.id ?? null, batch_gdp_status: status },
      notes: justification });
    return { id: rec.id, disposition, batch_gdp_status: status, stock_adjustment: adjustment,
      message: disposition === 'release' ? (status === 'ok' ? 'Released: the batch can be sold again' : 'Released; another excursion on this batch still waits')
        : disposition === 'quarantine' ? 'Quarantined: the batch stays held until it is released or destroyed'
          : adjustment ? `To be destroyed: write-off ${adjustment.adjustment_no} raised for a second person to approve (destruction register)`
            : 'To be destroyed: the batch can never be supplied' };
  });
}
