// Pure rules of the online-sale status of a product (Sprint 39, handover D4 / D5;
// owner decision 2026-10-03; Rulebook C-10 Schedule X / NDPS never online, C-46 audit).
//   permitted  — may be sold online (buyers see and buy it, subject to every other rule)
//   restricted — not allowed online for now (the default for every NEW product until a
//                pharmacist sets it; also a temporary stop)
//   prohibited — banned for online sale (e.g. a Gazette notification; Schedule X / NDPS)
// Who sets it (developer's decision, DECISIONS 2026-10-03): only a Dawabag pharmacist
// (pharmacist_rx) with a valid registration may ALLOW a product (permitted), and only with
// a dated notification / approval reference. Admins and pharmacists may STOP a product
// (restricted / prohibited) at once with a reason — stopping is always safe.
// No database imports: unit-tested in rules.test.ts.

export const ONLINE_SALE_STATUSES = ['permitted', 'restricted', 'prohibited'] as const;
export type OnlineSaleStatus = (typeof ONLINE_SALE_STATUSES)[number];

export const NEVER_ONLINE_SCHEDULES = ['Schedule X', 'NDPS'];

/** The ONE buyer-side condition (alias p): only permitted products are offered or sold. */
export const onlineSellableSql = (alias = 'p') => `${alias}.online_sale_status = 'permitted'`;

export interface StatusInput {
  status: OnlineSaleStatus;
  notification_ref?: string | null;
  notification_date?: string | null;      // YYYY-MM-DD
  reason?: string | null;
  /** Sprint 40: required to permit a product flagged as a new drug (productClass/rules.ts) */
  new_drug_confirmation?: string | null;
}

export function mayAllow(role: string): boolean { return role === 'pharmacist_rx'; }
export function mayStop(role: string): boolean { return ['pharmacist_rx', 'admin', 'super_admin'].includes(role); }

/** Plain reasons a change cannot be made (empty = fine). Schedule per product is checked separately. */
export function statusInputProblems(i: StatusInput, role: string, today: string): string[] {
  const p: string[] = [];
  if (!(ONLINE_SALE_STATUSES as readonly string[]).includes(i.status)) return ['Choose permitted, restricted or prohibited'];
  const ref = String(i.notification_ref ?? '').trim();
  const reason = String(i.reason ?? '').trim();
  if (i.status === 'permitted') {
    if (!mayAllow(role)) p.push('Only a Dawabag pharmacist may allow a product for online sale');
    if (ref.length < 3) p.push('Enter the notification or approval reference that allows online sale (e.g. the Gazette or rule reference)');
    if (!i.notification_date || !/^\d{4}-\d{2}-\d{2}$/.test(i.notification_date)) p.push('Enter the date of that notification (YYYY-MM-DD)');
    else if (i.notification_date > today) p.push('The notification date cannot be in the future');
  } else {
    if (!mayStop(role)) p.push('Only a pharmacist or an admin may stop a product for online sale');
    if (reason.length < 5) p.push('Say why the product is not allowed online (at least 5 characters)');
    if (i.notification_date && (!/^\d{4}-\d{2}-\d{2}$/.test(i.notification_date) || i.notification_date > today)) p.push('Enter a past notification date (YYYY-MM-DD)');
  }
  return p;
}

/** Schedule X and NDPS can never be permitted (the database refuses it too). */
export function scheduleProblem(status: OnlineSaleStatus, drugSchedule: string | null | undefined, name: string): string | null {
  return status === 'permitted' && NEVER_ONLINE_SCHEDULES.includes(String(drugSchedule)) ? `${name} is ${drugSchedule}: it can never be sold online (C-10)` : null;
}

/** The buyer's words for a product that is not offered online. */
export function notOnlineMessage(name: string, status: string): string {
  return status === 'prohibited' ? `${name} cannot be sold online` : `${name} is not available for online sale right now`;
}
