// Sprint 32 — trade prices follow the buyer's drug licence LIVE. Before, a retailer or
// wholesaler whose licence lapsed today kept seeing trade prices (PTR / PTS) until the
// nightly job set pending_renewal (orders were already refused on the day, Sprint 30).
// Now every request that picks a price type (search, product page, cart, checkout —
// all read req.user.pricing_type from auth.middleware) checks the licences: with any
// checked licence lapsed, the buyer sees retail prices and a plain banner until a
// renewal is checked (C-14: an expired licence stops trade buying; C-11).
// Reuses the Sprint 30 eligibility rule (forms.ts) — no second rule.
import { todayIST } from '../../utils/ist';
import { BuyerType, effectiveCustomerType } from '../../utils/customerType';
import { eligibility, formLabel, HeldLicence, Party, validity } from './forms';
import { listLicences } from './register.service';

export interface TradePause {
  form: string;
  label: string;              // "Form 20B"
  licence_number: string;
  expired_on: string;         // YYYY-MM-DD
}

type Held = HeldLicence & { licence_number: string; form_name?: string | null };

/** The licence that pauses trade prices (the earliest lapsed checked one), or null. Pure. */
export function tradePause(licences: Held[], party: Party, today: string): TradePause | null {
  if (!eligibility(licences, party, today).expired.length) return null;
  const lapsed = licences
    .filter((l) => (l.status ?? 'verified') === 'verified' && validity(l.valid_upto, today) === 'expired')
    .sort((a, b) => String(a.valid_upto).localeCompare(String(b.valid_upto)))[0];
  return {
    form: String(lapsed.form), label: formLabel(String(lapsed.form), lapsed.form_name),
    licence_number: lapsed.licence_number, expired_on: String(lapsed.valid_upto),
  };
}

/** The buyer party whose licences decide trade prices (doctors / hospitals need none). */
export function licensedTradeParty(customerType: string | null | undefined): Party | null {
  return customerType === 'b2b_retailer' ? 'retailer' : customerType === 'b2b_wholesaler' ? 'wholesaler' : null;
}

/** The price type to use now, and why trade prices are paused (if they are). */
export async function livePricingType(user: { id: string; customer_type: string | null; kyc_status: string | null }):
  Promise<{ pricing_type: BuyerType; trade_paused: TradePause | null }> {
  const type = effectiveCustomerType(user.customer_type, user.kyc_status);
  const party = licensedTradeParty(user.customer_type);
  // Approved accounts, and accounts the nightly job already moved to pending_renewal
  // (still retail prices there, but the banner keeps saying why)
  if (!party || !['approved', 'pending_renewal'].includes(String(user.kyc_status))) return { pricing_type: type, trade_paused: null };
  const pause = tradePause(await listLicences({ userId: user.id }), party, todayIST());
  return pause ? { pricing_type: 'customer', trade_paused: pause } : { pricing_type: type, trade_paused: null };
}
