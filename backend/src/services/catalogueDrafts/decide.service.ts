// Sprint 29 — the pharmacist's decision on a draft product.
//   Approve (pharmacist_rx only, as any C-19 copy approval): the draft becomes a
//   live, active product and its copy is approved through the SAME transaction-level
//   review as the "Product copy" queue (reviewContentTx, audit product_copy_approved).
//   Its partner requests become 'linked'; the item links already point at it, so the
//   partner's next upload or re-check matches it, and listing then follows the usual
//   partner rules (price ≤ MRP C-16, H1 pharmacist, cold-chain declaration C-25).
//   Approve as Schedule X / NDPS: kept as 'not_listed' — never active, never sold
//   online, its requests closed and its item links removed (C-10).
//   Reject ("not a medicine we list"): the draft is removed (soft delete) and its
//   requests closed with the reason.
// Every decision is audited (C-46).
import { withTransaction } from '../../config/database';
import { cacheDel } from '../../config/redis';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { copyFlags, reviewContentTx } from '../productContent.service';
import { lockOpenDraft } from './queue.service';
import { approvalProblems, NEVER_ONLINE } from './rules';
import { setOnlineStatusTx } from '../onlineSale/status.service';
import type { StatusInput } from '../onlineSale/rules';
import { setBuyerRestrictionTx } from '../buyerRestriction/status.service';
import type { RestrictionInput } from '../buyerRestriction/rules';

const DEFAULT_NOTE = 'New product completed from a partner request and approved in "New products to complete"';

const DECIDED = ['name', 'generic_name', 'composition', 'strength', 'dosage_form', 'drug_schedule', 'cold_chain', 'product_class', 'is_new_drug', 'hsn_code',
  'gst_rate', 'category', 'description', 'storage_instructions', 'net_quantity', 'manufacturer_name', 'manufacturer_address',
  'country_of_origin', 'mrp_paise'] as const;

// Sprint 39: the approved product is 'restricted' (not sold online) until a pharmacist sets its
// online-sale status — done in the same form (onlineSale) so approval is not a dead end (C-10)
// Sprint 47: "Who may buy" in the same form — a restriction to doctors and hospitals or to
// licensed trade buyers, with the pharmacist's reason (left out = everyone, the default)
export async function approveDraft(productId: string, pharmacistId: string, notes?: string, onlineSale?: StatusInput,
  buyerRestriction?: RestrictionInput) {
  const result = await withTransaction(async (c) => {
    const p = await lockOpenDraft(c, productId);
    const problems = approvalProblems(p, p.cold_chain_decided);
    if (problems.length) throw new AppError(`Not ready to approve: ${problems.join('; ')}`, 400);
    const decided = Object.fromEntries(DECIDED.map((k) => [k, p[k] ?? null]));
    const note = notes?.trim() || null;

    if (NEVER_ONLINE.includes(p.drug_schedule)) {
      await c.query(`UPDATE products SET catalogue_state = 'not_listed', is_active = FALSE, online_sale_status = 'prohibited',
                       online_sale_reason = $2, online_sale_set_by = $3, online_sale_set_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [productId, `${p.drug_schedule}: never sold online (C-10)`, pharmacistId]);
      await c.query(
        `UPDATE catalogue_drafts SET status = 'not_listed', decided_by = $2, decided_at = NOW(), decision_note = $3 WHERE product_id = $1`,
        [productId, pharmacistId, note]);
      const closed = await c.query(
        `UPDATE partner_product_requests SET status = 'rejected', resolution_note = $2, resolved_by = $3, resolved_at = NOW()
         WHERE product_id = $1 AND status = 'drafted'`,
        [productId, `${p.drug_schedule}: never sold online (C-10)`, pharmacistId]);
      await c.query('DELETE FROM partner_item_links WHERE product_id = $1', [productId]);
      await writeAuditTx(c, { userId: null, action: 'catalogue_draft_not_listed', performedBy: pharmacistId,
        newValue: { product_id: productId, ...decided, requests_closed: closed.rowCount }, notes: note });
      return { id: productId, status: 'not_listed' as const, sellable: false, requests: closed.rowCount ?? 0 };
    }

    // C-19: flagged copy needs the pharmacist's own reason, never the default note
    const flags = copyFlags(p);
    if (flags.length && (!note || note.length < 20)) {
      throw new AppError('This copy has flagged claims; explain why it is acceptable (at least 20 characters) or change it', 400);
    }
    await c.query(
      `UPDATE products SET catalogue_state = 'live', is_active = TRUE, content_status = 'pending_review', content_flags = $2,
              updated_at = NOW() WHERE id = $1`,
      [productId, JSON.stringify(flags)]);
    await reviewContentTx(c, pharmacistId, productId, true, note ?? DEFAULT_NOTE);
    await c.query(
      `UPDATE catalogue_drafts SET status = 'approved', decided_by = $2, decided_at = NOW(), decision_note = $3 WHERE product_id = $1`,
      [productId, pharmacistId, note]);
    const linked = await c.query(
      `UPDATE partner_product_requests SET status = 'linked', resolved_by = $2, resolved_at = NOW()
       WHERE product_id = $1 AND status = 'drafted'`, [productId, pharmacistId]);
    await writeAuditTx(c, { userId: null, action: 'catalogue_draft_approved', performedBy: pharmacistId,
      newValue: { product_id: productId, ...decided, requests_linked: linked.rowCount }, notes: note });
    if (buyerRestriction && buyerRestriction.restriction !== 'everyone') {
      await setBuyerRestrictionTx(c, { id: pharmacistId, role: 'pharmacist_rx' }, productId, buyerRestriction);
    }
    if (onlineSale) await setOnlineStatusTx(c, { id: pharmacistId, role: 'pharmacist_rx' }, [productId], onlineSale);
    const after = (await c.query(`SELECT online_sale_status, buyer_restriction FROM products WHERE id = $1`, [productId])).rows[0];
    const online = after.online_sale_status as string;
    return { id: productId, status: 'approved' as const, sellable: online === 'permitted', online_sale_status: online,
      buyer_restriction: after.buyer_restriction as string, requests: linked.rowCount ?? 0 };
  });
  await cacheDel(`product:${productId}`);
  await cacheDel('categories');
  return result;
}

export async function rejectDraft(productId: string, userId: string, reason: string) {
  const text = reason.trim();
  if (text.length < 3) throw new AppError('Give a reason', 400);
  return withTransaction(async (c) => {
    await lockOpenDraft(c, productId);
    await c.query(
      `UPDATE products SET catalogue_state = 'rejected', is_active = FALSE, deleted_at = NOW(), updated_at = NOW() WHERE id = $1`, [productId]);
    await c.query(
      `UPDATE catalogue_drafts SET status = 'rejected', decided_by = $2, decided_at = NOW(), decision_note = $3 WHERE product_id = $1`,
      [productId, userId, text]);
    const closed = await c.query(
      `UPDATE partner_product_requests SET status = 'rejected', resolution_note = $2, resolved_by = $3, resolved_at = NOW()
       WHERE product_id = $1 AND status = 'drafted'`, [productId, text, userId]);
    await c.query('DELETE FROM partner_item_links WHERE product_id = $1', [productId]);
    await writeAuditTx(c, { userId: null, action: 'catalogue_draft_rejected', performedBy: userId,
      newValue: { product_id: productId, requests_closed: closed.rowCount }, notes: text });
    return { id: productId, status: 'rejected' as const, requests: closed.rowCount ?? 0 };
  });
}
