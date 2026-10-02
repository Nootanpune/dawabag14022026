// Sprint 32 — the admin dashboard's warnings about selling rights. When Dawabag's
// licence register (C-07) has no in-date licence for a kind of sale, Dawabag's own
// stock is NOT offered to those buyers (blocked, never sold unlicensed); this tells the
// admins why, instead of the stock silently disappearing. Partners that can sell to
// nobody (no checked, in-date Form 20/21 or 20B/21B) are listed too (C-33). Sprint 34:
// each kind of sale is split by form — Form 20 / 20B for most medicines, 21 / 21B for
// Schedule C / C1 — and a register missing one of them is warned about too.
import { query } from '../../config/database';
import { todayIST } from '../../utils/ist';
import { DAWABAG_REGISTER_TYPES, SALE_KIND_WORDS, SaleKind, dawabagMaySupply, partnerMaySupply } from './sellingRights';

export interface SellingRightsWarning {
  code: 'dawabag_no_retail_licence' | 'dawabag_no_trade_licence' | 'partner_no_rights'
    // Sprint 34: the register covers the kind of sale but not one of its two forms
    | 'dawabag_no_form_20' | 'dawabag_no_form_21' | 'dawabag_no_form_20b' | 'dawabag_no_form_21b';
  message: string;
  link: string;
}

/** Per kind of sale: other medicines (Form 20 / 20B) and Schedule C / C1 medicines (Form 21 / 21B). */
export type FormRights = Record<SaleKind, { other: boolean; schedule_c: boolean }>;

export interface SellingRightsStatus {
  dawabag: Record<SaleKind, boolean>;
  dawabag_forms: FormRights;
  partners: { id: string; name: string; retail: boolean; trade: boolean; forms: FormRights }[];
  warnings: SellingRightsWarning[];
}

export async function sellingRightsStatus(): Promise<SellingRightsStatus> {
  const today = todayIST();
  const register = await query<{ licence_type: string; valid_upto: string | null; is_active: boolean }>(
    `SELECT licence_type, to_char(valid_upto, 'YYYY-MM-DD') AS valid_upto, is_active
     FROM business_licences WHERE licence_type = ANY($1)`,
    [[...DAWABAG_REGISTER_TYPES.retail, ...DAWABAG_REGISTER_TYPES.trade]]);
  const dawabag = { retail: dawabagMaySupply(register, 'retail', today), trade: dawabagMaySupply(register, 'trade', today) };
  const formsOf = (may: (kind: SaleKind, scheduleC: boolean) => boolean): FormRights => ({
    retail: { other: may('retail', false), schedule_c: may('retail', true) },
    trade: { other: may('trade', false), schedule_c: may('trade', true) },
  });
  const dawabagForms = formsOf((k, c) => dawabagMaySupply(register, k, today, c));

  // Approved, active partners with a live listing: what each may sell
  const rows = await query<{ id: string; name: string; form: string | null; valid_upto: string | null; status: string | null }>(
    `SELECT v.id, COALESCE(v.trade_name, v.name) AS name, pl.form, to_char(pl.valid_upto, 'YYYY-MM-DD') AS valid_upto, pl.status
     FROM vendors v
     LEFT JOIN party_licences pl ON pl.vendor_id = v.id AND pl.status = 'verified'
     WHERE v.approval_status = 'approved' AND v.is_active AND v.vendor_type IN ('marketplace_partner', 'both')
       AND EXISTS (SELECT 1 FROM partner_products pp WHERE pp.partner_id = v.id AND pp.listing_status = 'live' AND pp.approval_status = 'approved')
     ORDER BY 2`);
  const byPartner = new Map<string, { name: string; licences: { form: string; valid_upto: string | null; status: string }[] }>();
  for (const r of rows) {
    const p = byPartner.get(r.id) ?? { name: r.name, licences: [] };
    if (r.form) p.licences.push({ form: r.form, valid_upto: r.valid_upto, status: r.status ?? 'verified' });
    byPartner.set(r.id, p);
  }
  const partners = [...byPartner.entries()].map(([id, p]) => ({
    id, name: p.name,
    retail: partnerMaySupply(p.licences, 'retail', today),
    trade: partnerMaySupply(p.licences, 'trade', today),
    forms: formsOf((k, c) => partnerMaySupply(p.licences, k, today, c)),
  }));

  const warnings: SellingRightsWarning[] = [];
  for (const kind of ['retail', 'trade'] as SaleKind[]) {
    if (dawabag[kind]) continue;
    warnings.push({
      code: kind === 'retail' ? 'dawabag_no_retail_licence' : 'dawabag_no_trade_licence',
      message: `Dawabag's own stock is not offered to ${SALE_KIND_WORDS[kind].buyers}: the licence register has no in-date ${SALE_KIND_WORDS[kind].licence}. Add or renew it in the licence register.`,
      link: '/admin/licences',
    });
  }
  // The kind of sale is covered but one of its forms is not (Drugs Rules, Sprint 34)
  const FORM_WORDS = {
    retail: { other: ['dawabag_no_form_20', 'Form 20', 'medicines other than Schedule C / C1'], schedule_c: ['dawabag_no_form_21', 'Form 21', 'Schedule C / C1 medicines (biologicals such as vaccines, sera and insulin)'] },
    trade: { other: ['dawabag_no_form_20b', 'Form 20B', 'medicines other than Schedule C / C1'], schedule_c: ['dawabag_no_form_21b', 'Form 21B', 'Schedule C / C1 medicines (biologicals such as vaccines, sera and insulin)'] },
  } as const;
  for (const kind of ['retail', 'trade'] as SaleKind[]) {
    if (!dawabag[kind]) continue;
    for (const which of ['other', 'schedule_c'] as const) {
      if (dawabagForms[kind][which]) continue;
      const [code, form, what] = FORM_WORDS[kind][which];
      warnings.push({
        code,
        message: `Dawabag's own stock of ${what} is not offered to ${SALE_KIND_WORDS[kind].buyers}: the licence register has no in-date ${form}. Add or renew it in the licence register.`,
        link: '/admin/licences',
      });
    }
  }
  for (const p of partners.filter((x) => !x.retail && !x.trade)) {
    warnings.push({
      code: 'partner_no_rights',
      message: `Partner ${p.name} has live listings but no checked, in-date retail (Form 20 / 21) or wholesale (Form 20B / 21B) drug licence, so it is not offered to any buyer.`,
      link: `/admin/partners/${p.id}`,
    });
  }
  return { dawabag, dawabag_forms: dawabagForms, partners, warnings };
}
