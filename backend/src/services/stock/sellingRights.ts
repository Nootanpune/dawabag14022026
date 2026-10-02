// Sprint 32 — who may sell to whom, by drug licence (the gap noted in Sprints 28 and 30).
// A sale to a RETAIL buyer (a consumer, incl. a patient after a teleconsultation, and
// any account priced as a consumer) needs the seller's retail drug licence; a sale to a
// TRADE buyer (retail pharmacy, wholesaler, doctor / hospital) is a sale by way of
// wholesale and needs the seller's wholesale licence (Drugs and Cosmetics Rules, 1945):
//   retail  — Form 20 and/or 21            trade — Form 20B and/or 21B
// The same rule holds for marketplace partners (their checked licences in
// party_licences, C-33) and for Dawabag's own stock (Dawabag's licence register,
// business_licences, C-07). Availability shown to a buyer (search, product page, cart)
// and allocation read the SAME SQL from here, so a buyer is never shown stock that
// allocation cannot supply to them.
//
// C-33 / C-02 note — Schedule C / C1: Form 21 (21B) is the licence for Schedule C and C1
// medicines (biologicals etc.), Form 20 (20B) for the others. Products do not record
// Schedule C / C1 yet (drug_schedule has no such value), so today ONE in-date licence of
// the right kind (20 or 21; 20B or 21B) is enough. When products record Schedule C / C1,
// require Form 21 / 21B for those lines here (SELLER_FORMS by product) — nowhere else.
//
// Pure rules (unit-tested in sellingRights.test.ts) + the SQL fragments that apply them.
import { TRADE_TYPES } from '../../utils/customerType';
import { HeldLicence, LicenceForm } from '../licences/forms';

export type SaleKind = 'retail' | 'trade';

/** The kind of sale to this buyer: its price type (customer_type once KYC-approved and licences in date). */
export function saleKindFor(pricingType: string | null | undefined): SaleKind {
  return (TRADE_TYPES as readonly string[]).includes(String(pricingType)) ? 'trade' : 'retail';
}

/** Licence forms that allow each kind of sale (any one, in date, checked). */
export const SELLER_FORMS: Record<SaleKind, readonly LicenceForm[]> = {
  retail: ['dl20', 'dl21'],
  trade: ['dl20b', 'dl21b'],
};

/** Dawabag's own register types (business_licences.licence_type) for each kind of sale. */
export const DAWABAG_REGISTER_TYPES: Record<SaleKind, readonly string[]> = {
  retail: ['retail_20', 'retail_21'],
  trade: ['wholesale_20b', 'wholesale_21b'],
};

export const SALE_KIND_WORDS: Record<SaleKind, { buyers: string; licence: string }> = {
  retail: { buyers: 'retail buyers (patients and consumers)', licence: 'retail drug licence (Form 20 or 21)' },
  trade: { buyers: 'trade buyers (pharmacies, wholesalers, doctors and hospitals)', licence: 'wholesale drug licence (Form 20B or 21B)' },
};

/**
 * A partner may supply this kind of sale when it holds a CHECKED licence of the right
 * form valid today or later. (Any lapsed licence of the partner also stops all its
 * sales — the summary check kept from Sprint 30, applied alongside this one.)
 */
export function partnerMaySupply(licences: HeldLicence[], kind: SaleKind, today: string): boolean {
  return licences.some((l) => (l.status ?? 'verified') === 'verified'
    && SELLER_FORMS[kind].includes(l.form as LicenceForm)
    && !!l.valid_upto && l.valid_upto >= today);
}

export interface RegisterRow { licence_type: string; valid_upto: string | null; is_active?: boolean }

/**
 * Dawabag may supply this kind of sale from its own stock when its licence register
 * holds an active licence of the right type that has not lapsed. A register row with
 * no valid-till is taken as in force (the register allows it, e.g. a licence kept
 * in force by a retention fee); admins see the date on the Licence register page.
 */
export function dawabagMaySupply(rows: RegisterRow[], kind: SaleKind, today: string): boolean {
  return rows.some((r) => (r.is_active ?? true)
    && DAWABAG_REGISTER_TYPES[kind].includes(r.licence_type)
    && (!r.valid_upto || r.valid_upto >= today));
}

const list = (xs: readonly string[]) => xs.map((x) => `'${x}'`).join(', ');
const asKind = (k: SaleKind): SaleKind => (k === 'trade' ? 'trade' : 'retail');   // only these two words reach SQL

/** SQL: the partner (vendors alias `v`) may supply this kind of sale today (same as partnerMaySupply). */
export const partnerMaySupplySql = (v: string, kind: SaleKind) => `EXISTS (
    SELECT 1 FROM party_licences sr_pl
    WHERE sr_pl.vendor_id = ${v}.id AND sr_pl.status = 'verified'
      AND sr_pl.form IN (${list(SELLER_FORMS[asKind(kind)])}) AND sr_pl.valid_upto >= CURRENT_DATE)`;

/** SQL: Dawabag may supply this kind of sale from its own stock today (same as dawabagMaySupply). */
export const dawabagMaySupplySql = (kind: SaleKind) => `EXISTS (
    SELECT 1 FROM business_licences sr_bl
    WHERE sr_bl.is_active AND sr_bl.licence_type IN (${list(DAWABAG_REGISTER_TYPES[asKind(kind)])})
      AND (sr_bl.valid_upto IS NULL OR sr_bl.valid_upto >= CURRENT_DATE))`;

