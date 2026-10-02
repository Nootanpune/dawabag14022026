// Sprint 32 — who may sell to whom, by drug licence (the gap noted in Sprints 28 and 30).
// A sale to a RETAIL buyer (a consumer, incl. a patient after a teleconsultation, and
// any account priced as a consumer) needs the seller's retail drug licence; a sale to a
// TRADE buyer (retail pharmacy, wholesaler, doctor / hospital) is a sale by way of
// wholesale and needs the seller's wholesale licence (Drugs and Cosmetics Rules, 1945):
//   retail  — Form 20 and/or 21            trade — Form 20B and/or 21B
// Which form depends on the medicine (Drugs Rules, 1945; Sprint 34):
//   Schedule C / C1 products (biologicals: sera, vaccines, insulin, listed injectables;
//   products.schedule_c_c1, set by the pharmacist) — Form 21 (retail) / 21B (trade);
//   every other drug — Form 20 (retail) / 20B (trade).
// A seller holding only Form 20 cannot supply a Schedule C / C1 medicine, and one holding
// only Form 21 cannot supply the others. The same rule holds for marketplace partners
// (their checked licences in party_licences, C-33) and for Dawabag's own stock (its
// licence register, business_licences: retail_20 / retail_21 / wholesale_20b /
// wholesale_21b, C-07). Availability shown to a buyer (search, product page, cart) and
// allocation read the SAME SQL from here, so a buyer is never shown stock that
// allocation cannot supply to them.
//
// Pure rules (unit-tested in sellingRights.test.ts) + the SQL fragments that apply them.
import { TRADE_TYPES } from '../../utils/customerType';
import { HeldLicence, LicenceForm } from '../licences/forms';

export type SaleKind = 'retail' | 'trade';

/** The kind of sale to this buyer: its price type (customer_type once KYC-approved and licences in date). */
export function saleKindFor(pricingType: string | null | undefined): SaleKind {
  return (TRADE_TYPES as readonly string[]).includes(String(pricingType)) ? 'trade' : 'retail';
}

/** Licence forms that allow each kind of sale of SOME medicine (any one, in date, checked). */
export const SELLER_FORMS: Record<SaleKind, readonly LicenceForm[]> = {
  retail: ['dl20', 'dl21'],
  trade: ['dl20b', 'dl21b'],
};

/** The one form a seller needs for this kind of sale of this medicine (Drugs Rules, Sprint 34). */
export function requiredForm(kind: SaleKind, scheduleC: boolean): LicenceForm {
  if (kind === 'trade') return scheduleC ? 'dl21b' : 'dl20b';
  return scheduleC ? 'dl21' : 'dl20';
}

/** Dawabag's own register types (business_licences.licence_type) for each kind of sale. */
export const DAWABAG_REGISTER_TYPES: Record<SaleKind, readonly string[]> = {
  retail: ['retail_20', 'retail_21'],
  trade: ['wholesale_20b', 'wholesale_21b'],
};

/** The register type Dawabag needs for this kind of sale of this medicine. */
export function requiredRegisterType(kind: SaleKind, scheduleC: boolean): string {
  if (kind === 'trade') return scheduleC ? 'wholesale_21b' : 'wholesale_20b';
  return scheduleC ? 'retail_21' : 'retail_20';
}

export const SALE_KIND_WORDS: Record<SaleKind, { buyers: string; licence: string }> = {
  retail: { buyers: 'retail buyers (patients and consumers)', licence: 'retail drug licence (Form 20 or 21)' },
  trade: { buyers: 'trade buyers (pharmacies, wholesalers, doctors and hospitals)', licence: 'wholesale drug licence (Form 20B or 21B)' },
};

/**
 * A partner may supply this kind of sale of this medicine when it holds a CHECKED
 * licence of the required form (Form 20 / 20B, or 21 / 21B for a Schedule C / C1
 * product) valid today or later. scheduleC undefined = "any medicine" (dashboard: may
 * the partner sell anything at all). Any lapsed licence of the partner also stops all
 * its sales — the summary check kept from Sprint 30, applied alongside this one.
 */
export function partnerMaySupply(licences: HeldLicence[], kind: SaleKind, today: string, scheduleC?: boolean): boolean {
  const forms = scheduleC === undefined ? SELLER_FORMS[kind] : [requiredForm(kind, scheduleC)];
  return licences.some((l) => (l.status ?? 'verified') === 'verified'
    && forms.includes(l.form as LicenceForm)
    && !!l.valid_upto && l.valid_upto >= today);
}

export interface RegisterRow { licence_type: string; valid_upto: string | null; is_active?: boolean }

/**
 * Dawabag may supply this kind of sale of this medicine from its own stock when its
 * licence register holds an active licence of the required type that has not lapsed. A
 * register row with no valid-till is taken as in force (the register allows it, e.g. a
 * licence kept in force by a retention fee); admins see the date on the Licence register
 * page. scheduleC undefined = "any medicine".
 */
export function dawabagMaySupply(rows: RegisterRow[], kind: SaleKind, today: string, scheduleC?: boolean): boolean {
  const types = scheduleC === undefined ? DAWABAG_REGISTER_TYPES[kind] : [requiredRegisterType(kind, scheduleC)];
  return rows.some((r) => (r.is_active ?? true)
    && types.includes(r.licence_type)
    && (!r.valid_upto || r.valid_upto >= today));
}

const asKind = (k: SaleKind): SaleKind => (k === 'trade' ? 'trade' : 'retail');   // only these two words reach SQL

/**
 * The SQL builders below put an expression for the product (and a table alias) into the
 * statement text. Only fixed expressions written in this code base may be passed — a
 * column ('p.id'), a parameter placeholder ('$1::uuid') or an alias ('v') — never a
 * value from a request; anything else throws (security review Sprint 34).
 */
const SQL_REF = /^(\$\d{1,2}(::uuid)?|[a-z_][a-z0-9_]{0,30}(\.[a-z_][a-z0-9_]{0,30})?)$/;
export function sqlRef(expr: string): string {
  if (!SQL_REF.test(expr)) throw new Error(`Not a column, alias or parameter: ${JSON.stringify(expr)}`);
  return expr;
}

/** SQL: whether the product is a Schedule C / C1 medicine (FALSE when not marked). */
export const scheduleCSql = (productExpr: string) =>
  `COALESCE((SELECT sc_p.schedule_c_c1 FROM products sc_p WHERE sc_p.id = ${sqlRef(productExpr)}), FALSE)`;

/** SQL: the partner (vendors alias `v`) may supply this kind of sale of the product today (same as partnerMaySupply). */
export const partnerMaySupplySql = (v: string, kind: SaleKind, productExpr: string) => {
  const k = asKind(kind);
  return `EXISTS (
    SELECT 1 FROM party_licences sr_pl
    WHERE sr_pl.vendor_id = ${sqlRef(v)}.id AND sr_pl.status = 'verified'
      AND sr_pl.form = CASE WHEN ${scheduleCSql(productExpr)} THEN '${requiredForm(k, true)}' ELSE '${requiredForm(k, false)}' END
      AND sr_pl.valid_upto >= CURRENT_DATE)`;
};

/** SQL: Dawabag may supply this kind of sale of the product from its own stock today (same as dawabagMaySupply). */
export const dawabagMaySupplySql = (kind: SaleKind, productExpr: string) => {
  const k = asKind(kind);
  return `EXISTS (
    SELECT 1 FROM business_licences sr_bl
    WHERE sr_bl.is_active
      AND sr_bl.licence_type = CASE WHEN ${scheduleCSql(productExpr)} THEN '${requiredRegisterType(k, true)}' ELSE '${requiredRegisterType(k, false)}' END
      AND (sr_bl.valid_upto IS NULL OR sr_bl.valid_upto >= CURRENT_DATE))`;
};
