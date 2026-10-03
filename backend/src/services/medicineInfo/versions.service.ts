// Medicine information versions (Sprint 33): draft → submitted → pharmacist
// review → live. Buyers only ever see the one approved version; editing the
// live text starts a new draft, so the page keeps the old reviewed words until
// the new ones are approved. The review is the same C-19 path as the buyer copy
// of a product: claims are flagged (C-17 / C-19), flagged text needs the
// pharmacist's reason (≥ 20 characters) to approve, only a pharmacist with a
// State Pharmacy Council registration may approve, and every step is audited
// (C-46). The approval record (name, registration, date) is what the product
// page prints as "Reviewed by".
// Sprint 36 (owner decision 2026-10-03, four eyes): every person who wrote words of
// a version or sent it for review is recorded in author_ids, and none of them may
// approve it — a SECOND registered pharmacist must (the database refuses
// an approval by an author too: product_info_four_eyes). A rejection goes back to the
// authors ("Returned to you"); the previous approved text stays live throughout.
import { PoolClient } from 'pg';
import { query, queryOne, withTransaction } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { writeAuditTx } from '../../utils/audit';
import { DISCLAIMER, InfoContent, infoFlags, parseInfoContent, publicSections, submitProblems } from './content';

const VERSION_COLS = `v.id, v.product_id, v.version, v.status, v.content, v.flags, v.created_at, v.updated_at,
  v.submitted_at, v.reviewed_at, v.review_notes, v.reviewer_name, v.reviewer_reg_no,
  (SELECT full_name FROM user_profiles WHERE user_id = v.updated_by) AS updated_by_name,
  (SELECT full_name FROM user_profiles WHERE user_id = v.submitted_by) AS submitted_by_name,
  (SELECT full_name FROM user_profiles WHERE user_id = v.reviewed_by) AS reviewed_by_name,
  (SELECT COALESCE(array_agg(up.full_name ORDER BY up.full_name), '{}') FROM user_profiles up WHERE up.user_id = ANY(v.author_ids)) AS author_names`;

/** Adds a person to a version's authors (no duplicates). */
const ADD_AUTHOR = (param: string) => `author_ids = CASE WHEN ${param} = ANY(author_ids) THEN author_ids ELSE array_append(author_ids, ${param}) END`;

export const SELF_REVIEW_MESSAGE = 'You wrote or sent this version, so another registered pharmacist must approve it';

async function lockProduct(client: PoolClient, productId: string) {
  const p = (await client.query(
    `SELECT id, name, catalogue_state FROM products WHERE id = $1 AND deleted_at IS NULL FOR UPDATE`, [productId])).rows[0];
  if (!p) throw new AppError('Product not found', 404);
  if (p.catalogue_state === 'rejected' || p.catalogue_state === 'not_listed') {
    throw new AppError('This product is not sold online, so it has no medicine information', 409);
  }
  return p;
}

const openVersion = async (client: PoolClient, productId: string) => (await client.query(
  `SELECT * FROM product_info_versions WHERE product_id = $1 AND status IN ('draft', 'pending_review') FOR UPDATE`,
  [productId])).rows[0];

/** Staff editor: the live version, the one being written (if any) and the history. */
export async function infoEditor(productId: string) {
  const product = await queryOne<any>(
    `SELECT id, name, generic_name, sku, drug_schedule, catalogue_state, is_active FROM products WHERE id = $1 AND deleted_at IS NULL`,
    [productId]);
  if (!product) throw new AppError('Product not found', 404);
  const versions = await query<any>(
    `SELECT ${VERSION_COLS} FROM product_info_versions v WHERE v.product_id = $1 ORDER BY v.version DESC LIMIT 50`, [productId]);
  const live = versions.find((v) => v.status === 'approved') ?? null;
  const open = versions.find((v) => v.status === 'draft' || v.status === 'pending_review') ?? null;
  // A rejection newer than the live text: its reason is shown to the writer
  const lastRejected = versions.find((v) => v.status === 'rejected' && (!live || v.version > live.version)) ?? null;
  return {
    product,
    live, open,
    last_rejected: lastRejected,
    // the words to start from when nothing is open: the newest rejected text (to fix it) or the live text
    start_from: (open ?? lastRejected ?? live)?.content ?? parseInfoContent({}),
    problems: open ? submitProblems(parseInfoContent(open.content)) : [],
    history: versions.map(({ content, ...v }) => v),
  };
}

/**
 * Save the draft. With nothing open a new version is started; a version waiting
 * for review goes back to draft (it must be submitted again, so the reviewer never
 * approves words that changed under them).
 */
export async function saveInfoDraft(userId: string, productId: string, input: unknown) {
  const content = parseInfoContent(input);
  const flags = infoFlags(content);
  return withTransaction(async (client) => {
    await lockProduct(client, productId);
    const open = await openVersion(client, productId);
    let row;
    if (open) {
      row = (await client.query(
        `UPDATE product_info_versions SET content = $2, flags = $3, status = 'draft', updated_by = $4, updated_at = NOW(),
                submitted_by = NULL, submitted_at = NULL, ${ADD_AUTHOR('$4::uuid')} WHERE id = $1 RETURNING id, version, status`,
        [open.id, JSON.stringify(content), JSON.stringify(flags), userId])).rows[0];
    } else {
      const next = Number((await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM product_info_versions WHERE product_id = $1`, [productId])).rows[0].v);
      row = (await client.query(
        `INSERT INTO product_info_versions (product_id, version, status, content, flags, created_by, updated_by, author_ids)
         VALUES ($1, $2, 'draft', $3, $4, $5, $5, ARRAY[$5::uuid]) RETURNING id, version, status`,
        [productId, next, JSON.stringify(content), JSON.stringify(flags), userId])).rows[0];
    }
    await writeAuditTx(client, { userId: null, action: 'product_info_draft_saved', performedBy: userId,
      newValue: { product_id: productId, version: row.version, flags: flags.length, was_submitted: open?.status === 'pending_review' } });
    return { ...row, flags, problems: submitProblems(content) };
  });
}

/** Send the draft to the pharmacist's review (C-19). */
export async function submitInfo(userId: string, productId: string) {
  return withTransaction(async (client) => {
    await lockProduct(client, productId);
    const open = await openVersion(client, productId);
    if (!open) throw new AppError('There is no draft to send for review', 409);
    if (open.status === 'pending_review') throw new AppError('This version is already waiting for review', 409);
    const problems = submitProblems(parseInfoContent(open.content));
    if (problems.length) throw new AppError(problems.join('. '), 400);
    await client.query(
      `UPDATE product_info_versions SET status = 'pending_review', submitted_by = $2, submitted_at = NOW(), updated_at = NOW(),
              ${ADD_AUTHOR('$2::uuid')} WHERE id = $1`,
      [open.id, userId]);
    await writeAuditTx(client, { userId: null, action: 'product_info_submitted', performedBy: userId,
      newValue: { product_id: productId, version: open.version, flags: open.flags } });
    return { id: open.id, version: open.version, status: 'pending_review' };
  });
}

/** Pharmacist decision. Approval replaces the live text; the old version is kept as superseded. */
export async function reviewInfo(pharmacistId: string, productId: string, approve: boolean, notes: string) {
  return withTransaction(async (client) => {
    await lockProduct(client, productId);
    const reviewer = (await client.query(
      `SELECT u.pharmacist_reg_no, up.full_name FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id WHERE u.id = $1`,
      [pharmacistId])).rows[0];
    if (!reviewer?.pharmacist_reg_no) {
      throw new AppError('Add your pharmacy council registration number before reviewing medicine information', 403);
    }
    const open = await openVersion(client, productId);
    if (!open || open.status !== 'pending_review') throw new AppError('Nothing is waiting for review for this product', 409);
    // Four eyes (Sprint 36): nobody approves words they wrote or sent (C-19, C-46). An
    // author may still reject (withdraw) their own version.
    if (approve && (open.author_ids ?? []).includes(pharmacistId)) throw new AppError(SELF_REVIEW_MESSAGE, 403);
    const flags = Array.isArray(open.flags) ? open.flags : [];
    if (approve && flags.length && notes.length < 20) {
      throw new AppError('This text has flagged claims; explain why it is acceptable (at least 20 characters) or reject it', 400);
    }
    if (approve) {
      await client.query(`UPDATE product_info_versions SET status = 'superseded', updated_at = NOW()
                          WHERE product_id = $1 AND status = 'approved'`, [productId]);
    }
    await client.query(
      `UPDATE product_info_versions SET status = $2, reviewed_by = $3, reviewed_at = NOW(), review_notes = $4,
              reviewer_name = $5, reviewer_reg_no = $6, updated_at = NOW() WHERE id = $1`,
      [open.id, approve ? 'approved' : 'rejected', pharmacistId, notes,
        approve ? reviewer.full_name ?? 'Pharmacist' : null, approve ? reviewer.pharmacist_reg_no : null]);
    await writeAuditTx(client, { userId: null, action: approve ? 'product_info_approved' : 'product_info_rejected',
      performedBy: pharmacistId, newValue: { product_id: productId, version: open.version, flags,
        reviewer_name: reviewer.full_name ?? 'Pharmacist', reviewer_reg_no: reviewer.pharmacist_reg_no,
        author_ids: open.author_ids ?? [], ...(approve ? {} : { returned_to: open.author_ids ?? [] }) }, notes });
    return { product_id: productId, version: open.version, status: approve ? 'approved' : 'rejected',
      reviewer_name: reviewer.full_name ?? 'Pharmacist', reviewer_reg_no: reviewer.pharmacist_reg_no, reviewed_at: new Date().toISOString(),
      ...(approve ? {} : { returned_to_authors: (open.author_ids ?? []).length }) };
  });
}

/**
 * Versions waiting for a pharmacist, oldest first, with the text to review.
 * `authored_by_you`: the viewer wrote or sent it, so they cannot review it (Sprint 36).
 */
export async function infoReviewQueue(viewerId: string | null = null) {
  return query(
    `SELECT ${VERSION_COLS}, p.name AS product_name, p.sku, p.drug_schedule, p.catalogue_state,
            COALESCE($1::uuid = ANY(v.author_ids), FALSE) AS authored_by_you
     FROM product_info_versions v JOIN products p ON p.id = v.product_id
     WHERE v.status = 'pending_review' AND p.deleted_at IS NULL
     ORDER BY v.submitted_at LIMIT 200`, [viewerId]);
}

/**
 * Sprint 36: rejected versions sent back to the viewer — they wrote or sent them and
 * nothing newer has been started for that product since. Newest first.
 */
export async function infoReturnedTo(userId: string) {
  return query(
    `SELECT ${VERSION_COLS}, p.name AS product_name, p.sku, p.drug_schedule, p.catalogue_state
     FROM product_info_versions v JOIN products p ON p.id = v.product_id
     WHERE v.status = 'rejected' AND $1::uuid = ANY(v.author_ids) AND p.deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM product_info_versions n WHERE n.product_id = v.product_id AND n.version > v.version)
     ORDER BY v.reviewed_at DESC LIMIT 200`, [userId]);
}

/**
 * The buyer's view: the approved version only, empty sections left out, with the
 * C-19 review record and the standing disclaimer. Nothing for a product that is
 * not on sale.
 */
export async function publicInfo(productId: string) {
  const v = await queryOne<any>(
    `SELECT v.version, v.content, v.reviewed_at, v.reviewer_name, v.reviewer_reg_no
     FROM product_info_versions v JOIN products p ON p.id = v.product_id
     WHERE v.product_id = $1 AND v.status = 'approved' AND p.is_active = TRUE AND p.deleted_at IS NULL
       AND COALESCE(p.drug_schedule, '') NOT IN ('Schedule X', 'NDPS')`, [productId]);
  if (!v) return { available: false, disclaimer: DISCLAIMER };
  return {
    available: true,
    version: v.version,
    sections: publicSections(parseInfoContent(v.content as InfoContent)),
    reviewed: { name: v.reviewer_name, reg_no: v.reviewer_reg_no, reviewed_at: v.reviewed_at },
    disclaimer: DISCLAIMER,
  };
}
