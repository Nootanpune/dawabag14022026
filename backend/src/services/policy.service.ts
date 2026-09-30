// src/services/policy.service.ts — published policies (Rulebook C-39, C-37)
// Terms, privacy, shipping, cancellation and refund policies live only in the
// database, versioned; a new version never overwrites an old one, so what a
// buyer agreed to on a date can always be shown.
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';

export const POLICY_KEYS = ['terms', 'privacy', 'shipping', 'cancellation', 'refund'] as const;
export type PolicyKey = typeof POLICY_KEYS[number];

export async function currentPolicies() {
  return query(
    `SELECT DISTINCT ON (doc_key) doc_key, version, title, effective_from, lawyer_reviewed, published_at
     FROM policy_documents WHERE effective_from <= CURRENT_DATE ORDER BY doc_key, version DESC`);
}

export async function getPolicy(key: PolicyKey, version?: number) {
  const p = await queryOne(
    version
      ? `SELECT doc_key, version, title, body, effective_from, lawyer_reviewed, published_at FROM policy_documents
         WHERE doc_key = $1 AND version = $2`
      : `SELECT doc_key, version, title, body, effective_from, lawyer_reviewed, published_at FROM policy_documents
         WHERE doc_key = $1 AND effective_from <= CURRENT_DATE ORDER BY version DESC LIMIT 1`,
    version ? [key, version] : [key]);
  if (!p) throw new AppError('This policy has not been published yet', 404);
  return p;
}

export async function policyHistory(key: PolicyKey) {
  return query(
    `SELECT version, title, effective_from, lawyer_reviewed, published_at FROM policy_documents
     WHERE doc_key = $1 ORDER BY version DESC`, [key]);
}

export async function publishPolicy(adminId: string, input: {
  doc_key: PolicyKey; title: string; body: string; effective_from: string; lawyer_reviewed: boolean;
}) {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`policy:${input.doc_key}`]);
    const version = Number((await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM policy_documents WHERE doc_key = $1`, [input.doc_key])).rows[0].v);
    const row = (await client.query(
      `INSERT INTO policy_documents (doc_key, version, title, body, effective_from, lawyer_reviewed, published_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING doc_key, version, effective_from`,
      [input.doc_key, version, input.title, input.body, input.effective_from, input.lawyer_reviewed, adminId])).rows[0];
    await writeAuditTx(client, { userId: null, action: 'policy_published', performedBy: adminId,
      newValue: { doc_key: input.doc_key, version, lawyer_reviewed: input.lawyer_reviewed } });
    return row;
  });
}
