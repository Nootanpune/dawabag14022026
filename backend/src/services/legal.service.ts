// src/services/legal.service.ts — public legal details for the site footer and
// checkout (Rulebook C-04, C-35, C-36), read from app_settings. Dawabag's drug licence
// numbers come from its licence register (business_licences, C-07) — the one authority
// since Sprint 30 (the old 'legal.drug_licences' setting was copied in and removed).
import { query } from '../config/database';
import { isTrial } from '../config/env';
import { dawabagDrugLicences } from './licences/register.service';

export async function legalInfo() {
  const rows = await query<{ key: string; value: any }>(
    `SELECT key, value FROM app_settings WHERE key IN
       ('legal.entity', 'legal.pharmacist_in_charge', 'legal.grievance_officer')`);
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const own = await dawabagDrugLicences();
  const first = (form: string) => own.find((l) => l.form === form)?.licence_number ?? '';
  const dates = own.map((l) => l.valid_upto).filter((d): d is string => !!d).sort();
  // Same keys the footer has always read, plus every drug licence on the register
  const drugLicences = { retail_20: first('dl20'), retail_21: first('dl21'), wholesale_20b: first('dl20b'), wholesale_21b: first('dl21b'),
    valid_upto: dates[0] ?? '', list: own.map((l) => ({ form: l.form, label: l.label, number: l.licence_number, valid_upto: l.valid_upto })) };
  return {
    entity: v['legal.entity'] ?? null,
    drug_licences: drugLicences,
    pharmacist_in_charge: v['legal.pharmacist_in_charge'] ?? null,
    grievance_officer: v['legal.grievance_officer'] ?? null,
    grievance_policy: { acknowledge_within_hours: 48, resolve_within_days: 30 },
    // Trial server (APP_ENV=trial): the site says on every page that it is a demo with
    // placeholder licences and no real sales, so nobody mistakes it for a pharmacy (C-04)
    trial: isTrial(),
  };
}
