// src/services/policy.service.ts — published policies (Rulebook C-39, C-37)
// Terms, privacy, shipping, cancellation and refund policies live only in the
// database, versioned; a new version never overwrites an old one, so what a
// buyer agreed to on a date can always be shown.
import { query, queryOne, withTransaction } from '../config/database';
import { AppError } from '../utils/AppError';
import { writeAuditTx } from '../utils/audit';

export const POLICY_KEYS = ['terms', 'privacy', 'shipping', 'cancellation', 'refund'] as const;
export type PolicyKey = typeof POLICY_KEYS[number];
// English is the master text; Marathi and Hindi render the same version (DPDP s.5(3), C-40)
export const LANGUAGES = ['en', 'mr', 'hi'] as const;
export type Language = typeof LANGUAGES[number];

// The current English version of each policy, and which translations of it exist
export async function currentPolicies() {
  return query(
    `SELECT DISTINCT ON (p.doc_key) p.doc_key, p.version, p.title, p.effective_from, p.lawyer_reviewed, p.published_at,
            ARRAY(SELECT t.language FROM policy_documents t WHERE t.doc_key = p.doc_key AND t.version = p.version ORDER BY t.language) AS languages
     FROM policy_documents p WHERE p.language = 'en' AND p.effective_from <= CURRENT_DATE ORDER BY p.doc_key, p.version DESC`);
}

// In the reader's language when that translation of the current version exists, else English
export async function getPolicy(key: PolicyKey, version?: number, language: Language = 'en') {
  const en = await queryOne<any>(
    version
      ? `SELECT version FROM policy_documents WHERE doc_key = $1 AND version = $2 AND language = 'en'`
      : `SELECT version FROM policy_documents WHERE doc_key = $1 AND language = 'en' AND effective_from <= CURRENT_DATE ORDER BY version DESC LIMIT 1`,
    version ? [key, version] : [key]);
  if (!en) throw new AppError('This policy has not been published yet', 404);
  const p = await queryOne<any>(
    `SELECT doc_key, version, language, title, body, effective_from, lawyer_reviewed, published_at FROM policy_documents
     WHERE doc_key = $1 AND version = $2 AND language = ANY($3) ORDER BY (language = $4) DESC LIMIT 1`,
    [key, en.version, [language, 'en'], language]);
  return { ...p, requested_language: language, translation_available: p.language === language };
}

// What a consent record cites: the privacy notice version and language actually shown
export async function privacyNoticeRef(language: Language): Promise<{ version: string; language: Language }> {
  const p = await queryOne<any>(
    `SELECT version, language FROM policy_documents WHERE doc_key = 'privacy' AND effective_from <= CURRENT_DATE
       AND version = (SELECT MAX(version) FROM policy_documents WHERE doc_key = 'privacy' AND language = 'en' AND effective_from <= CURRENT_DATE)
     ORDER BY (language = $1) DESC, (language = 'en') DESC LIMIT 1`, [language]);
  // Before the first notice is published (development), fall back to the built-in label
  return p ? { version: `privacy-v${p.version}`, language: p.language } : { version: 'unpublished', language: 'en' };
}

export async function policyHistory(key: PolicyKey) {
  return query(
    `SELECT version, language, title, effective_from, lawyer_reviewed, published_at FROM policy_documents
     WHERE doc_key = $1 ORDER BY version DESC, language`, [key]);
}

// A translation of an existing English version (same version number, same effective date)
export async function publishTranslation(adminId: string, input: { doc_key: PolicyKey; version: number; language: 'mr' | 'hi'; title: string; body: string; lawyer_reviewed: boolean }) {
  return withTransaction(async (client) => {
    const en = (await client.query(`SELECT effective_from FROM policy_documents WHERE doc_key = $1 AND version = $2 AND language = 'en'`,
      [input.doc_key, input.version])).rows[0];
    if (!en) throw new AppError('Publish the English text of this version first', 404);
    const row = (await client.query(
      `INSERT INTO policy_documents (doc_key, version, language, title, body, effective_from, lawyer_reviewed, published_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (doc_key, language, version) DO NOTHING RETURNING doc_key, version, language`,
      [input.doc_key, input.version, input.language, input.title, input.body, en.effective_from, input.lawyer_reviewed, adminId])).rows[0];
    if (!row) throw new AppError('That translation is already published; publish a new English version to change it', 409);
    await writeAuditTx(client, { userId: null, action: 'policy_translation_published', performedBy: adminId,
      newValue: { doc_key: input.doc_key, version: input.version, language: input.language, lawyer_reviewed: input.lawyer_reviewed } });
    return row;
  });
}

export async function publishPolicy(adminId: string, input: {
  doc_key: PolicyKey; title: string; body: string; effective_from: string; lawyer_reviewed: boolean;
}) {
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`policy:${input.doc_key}`]);
    const version = Number((await client.query(
      `SELECT COALESCE(MAX(version), 0) + 1 AS v FROM policy_documents WHERE doc_key = $1 AND language = 'en'`, [input.doc_key])).rows[0].v);
    const row = (await client.query(
      `INSERT INTO policy_documents (doc_key, version, title, body, effective_from, lawyer_reviewed, published_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING doc_key, version, effective_from`,
      [input.doc_key, version, input.title, input.body, input.effective_from, input.lawyer_reviewed, adminId])).rows[0];
    await writeAuditTx(client, { userId: null, action: 'policy_published', performedBy: adminId,
      newValue: { doc_key: input.doc_key, version, lawyer_reviewed: input.lawyer_reviewed } });
    return row;
  });
}
