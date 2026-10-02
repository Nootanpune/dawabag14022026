// Sprint 32 — who may be supplied from Dawabag's own stock and from each partner, by
// drug licence (retail: Form 20/21; trade: Form 20B/21B). The server works it out
// (GET /admin/selling-rights); the dashboard shows its warnings (C-07, C-33).
import api from '../api';

export interface SellingRightsWarning {
  code: 'dawabag_no_retail_licence' | 'dawabag_no_trade_licence' | 'partner_no_rights'
    | 'dawabag_no_form_20' | 'dawabag_no_form_21' | 'dawabag_no_form_20b' | 'dawabag_no_form_21b';   // Sprint 34
  message: string;
  link: string;
}

export interface SellingRights {
  dawabag: { retail: boolean; trade: boolean };
  partners: { id: string; name: string; retail: boolean; trade: boolean }[];
  warnings: SellingRightsWarning[];
}

export const sellingRightsKeys = { status: ['admin', 'selling-rights'] as const };

export async function fetchSellingRights(): Promise<SellingRights> {
  const { data } = await api.get('/admin/selling-rights');
  return data.data;
}
