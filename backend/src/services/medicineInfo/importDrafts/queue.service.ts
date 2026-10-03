// Sprint 45 — "Imported drafts to check": imported medicine-information drafts a
// registered pharmacist still has to check against the pack insert and send (C-19),
// by partner, and the counts shown on the Medicine information pages.
import { query } from '../../../config/database';

/** Partners a drafts file can be imported for (id and name only). */
export async function importPartners() {
  return query<{ id: string; name: string; linked_items: number }>(
    `SELECT v.id, v.name, (SELECT COUNT(*)::int FROM partner_item_links l WHERE l.partner_id = v.id) AS linked_items
       FROM vendors v WHERE v.vendor_type IN ('marketplace_partner', 'both') ORDER BY v.name LIMIT 500`);
}

/**
 * Imported drafts still open (draft = to check; pending_review = sent, waiting for the
 * second pharmacist), oldest first. `authored_by_you`: the viewer edited or sent it, so
 * another pharmacist must approve it (Sprint 36).
 */
export async function importedDrafts(viewerId: string, partnerId: string | null, status: 'draft' | 'pending_review' = 'draft') {
  return query(
    `SELECT v.id, v.product_id, v.version, v.status, v.flags, v.created_at, v.updated_at, v.submitted_at, v.import_meta,
            v.import_partner_id, vd.name AS import_partner_name,
            p.name AS product_name, p.sku, p.drug_schedule, p.catalogue_state,
            (SELECT full_name FROM user_profiles WHERE user_id = v.updated_by) AS updated_by_name,
            (SELECT COALESCE(array_agg(up.full_name ORDER BY up.full_name), '{}') FROM user_profiles up WHERE up.user_id = ANY(v.author_ids)) AS author_names,
            COALESCE($1::uuid = ANY(v.author_ids), FALSE) AS authored_by_you
       FROM product_info_versions v JOIN products p ON p.id = v.product_id LEFT JOIN vendors vd ON vd.id = v.import_partner_id
      WHERE v.source = 'imported_draft' AND v.status = $3 AND p.deleted_at IS NULL
        AND ($2::uuid IS NULL OR v.import_partner_id = $2)
      ORDER BY v.created_at, p.name LIMIT 500`, [viewerId, partnerId, status]);
}

/** Per partner: imported drafts to check and imported versions waiting for approval. */
export async function importedDraftCounts() {
  return query<{ partner_id: string | null; partner_name: string | null; to_check: number; waiting_approval: number }>(
    `SELECT v.import_partner_id AS partner_id, vd.name AS partner_name,
            COUNT(*) FILTER (WHERE v.status = 'draft')::int AS to_check,
            COUNT(*) FILTER (WHERE v.status = 'pending_review')::int AS waiting_approval
       FROM product_info_versions v JOIN products p ON p.id = v.product_id LEFT JOIN vendors vd ON vd.id = v.import_partner_id
      WHERE v.source = 'imported_draft' AND v.status IN ('draft', 'pending_review') AND p.deleted_at IS NULL
      GROUP BY v.import_partner_id, vd.name ORDER BY vd.name`);
}
