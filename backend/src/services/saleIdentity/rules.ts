// Pure rules of the frozen sale identity per shipment (Sprint 42; handover D15, gap
// analysis §5.1 #7). Rulebook C-05 (seller of record per shipment), C-07 / C-33 (sale
// only under the right drug licence), C-08 (pharmacist of record), C-13 (licences on the
// invoice as on the day of sale), C-46 (records that cannot be changed).
//
// The moment of sale is ORDER PLACEMENT: the transaction that fixes the seller of record,
// reserves the stock and takes the seller's gap-free invoice number and amounts. The
// identity is written there once and a database trigger keeps it (migration 37).
// No database imports: unit-tested in rules.test.ts.
import { requiredForm, SaleKind } from '../stock/sellingRights';

export type SaleChannel = 'retail' | 'wholesale';

/** Retail sale (Form 20 / 21) to consumers; sale by way of wholesale (Form 20B / 21B) to licensed trade buyers and doctors. */
export const channelFor = (kind: SaleKind): SaleChannel => (kind === 'trade' ? 'wholesale' : 'retail');

/** The price field a line was priced from (the products column without "_price_paise"). */
export type PriceField = 'offer' | 'ptr' | 'pts' | 'institutional';
export function priceFieldWord(column: string): PriceField {
  const word = column.replace(/_price_paise$/, '');
  return (['offer', 'ptr', 'pts', 'institutional'] as const).includes(word as PriceField) ? (word as PriceField) : 'offer';
}

/** A licence as kept on an invoice snapshot (licences/register.service snapshot()). */
export interface SnapLicence { form: string; label: string; number: string; valid_upto: string | null }

/** The one licence form this line is sold under (Schedule C / C1 → Form 21 / 21B). */
export const lineForm = (channel: SaleChannel, scheduleC: boolean) => requiredForm(channel === 'wholesale' ? 'trade' : 'retail', scheduleC);

/**
 * The seller's licence a line is sold under: of the required form, in date today (no date
 * = in force, as the licence register allows), the one valid longest. Allocation already
 * refused sellers without it; null means the snapshot holds none (recorded as such).
 */
export function lineLicence(snap: SnapLicence[], form: string, today: string): SnapLicence | null {
  const ofForm = snap.filter((l) => l.form === form && String(l.number ?? '').trim());
  const inDate = ofForm.filter((l) => !l.valid_upto || l.valid_upto >= today);
  const pick = (list: SnapLicence[]) => [...list].sort((a, b) => (b.valid_upto ?? '9999-12-31').localeCompare(a.valid_upto ?? '9999-12-31'))[0] ?? null;
  return pick(inDate) ?? pick(ofForm);
}

/** The licences actually used by a shipment's lines, each once, in snapshot order. */
export function usedLicences(snap: SnapLicence[], used: { form: string; number: string | null }[]): SnapLicence[] {
  const keys = new Set(used.filter((u) => u.number).map((u) => `${u.form}|${u.number}`));
  return snap.filter((l, i) => keys.has(`${l.form}|${l.number}`)
    && snap.findIndex((x) => x.form === l.form && x.number === l.number) === i);
}

/** "Form 20: MH-123 (valid till 2027-10-02)" — one line per licence used. */
export const licenceText = (l: SnapLicence) => `${l.label}: ${l.number}${l.valid_upto ? ` (valid till ${l.valid_upto})` : ''}`;

/** The pharmacist's registration as at the check, kept on the shipment (C-03, C-08). */
export interface RegistrationSnapshot {
  kind: 'staff' | 'partner';
  registration_no: string;
  state_council: string | null;
  valid_till: string | null;
  status: string | null;
  verified: boolean;
  recorded: 'at_check' | 'backfill';
}

export function registrationSnapshot(kind: 'staff' | 'partner', regNo: string,
  row: { state_council?: string | null; valid_till?: string | null; status?: string | null; verified_at?: unknown } | null | undefined): RegistrationSnapshot {
  return {
    kind, registration_no: regNo,
    state_council: row?.state_council ?? null, valid_till: row?.valid_till ?? null, status: row?.status ?? null,
    verified: !!row?.verified_at, recorded: 'at_check',
  };
}
