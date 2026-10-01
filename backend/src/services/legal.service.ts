// src/services/legal.service.ts — public legal details for the site footer and
// checkout (Rulebook C-04, C-35, C-36), read from app_settings.
import { query } from '../config/database';
import { isTrial } from '../config/env';

export async function legalInfo() {
  const rows = await query<{ key: string; value: any }>(
    `SELECT key, value FROM app_settings WHERE key IN
       ('legal.entity', 'legal.drug_licences', 'legal.pharmacist_in_charge', 'legal.grievance_officer')`);
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    entity: v['legal.entity'] ?? null,
    drug_licences: v['legal.drug_licences'] ?? null,
    pharmacist_in_charge: v['legal.pharmacist_in_charge'] ?? null,
    grievance_officer: v['legal.grievance_officer'] ?? null,
    grievance_policy: { acknowledge_within_hours: 48, resolve_within_days: 30 },
    // Trial server (APP_ENV=trial): the site says on every page that it is a demo with
    // placeholder licences and no real sales, so nobody mistakes it for a pharmacy (C-04)
    trial: isTrial(),
  };
}
