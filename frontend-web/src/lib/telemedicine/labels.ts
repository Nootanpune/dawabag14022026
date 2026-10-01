// Display text for teleconsultation screens. The server decides every rule;
// these only describe them.
import type { CancelResult, ConsultKind, ConsultMode, DoctorReviewStatus, PaymentStatus, TeleList } from './types';
import { formatPaise } from '../admin/format';

export const MODE_LABELS: Record<ConsultMode, string> = { video: 'Video', audio: 'Audio call', text: 'Chat (text)' };
export const MODES: readonly ConsultMode[] = ['video', 'audio', 'text'];
export const KIND_LABELS: Record<ConsultKind, string> = { first: 'First consultation', follow_up: 'Follow-up' };

export const TELE_LISTS: readonly TeleList[] = ['O', 'A', 'B', 'prohibited'];
export const TELE_LIST_LABELS: Record<TeleList, string> = {
  O: 'List O — any consultation, any mode',
  A: 'List A — first consult by video; re-fill in follow-up',
  B: 'List B — follow-up for the same condition only',
  prohibited: 'Prohibited — never by teleconsultation',
};

export function teleListShort(list: TeleList | null | undefined): string {
  if (!list) return 'Not classified';
  return list === 'prohibited' ? 'Prohibited' : `List ${list}`;
}

/** Which TPG lists a consultation may prescribe from (mirrors services/telemedicine/rules.ts; C-23). */
export function allowedListsText(kind: ConsultKind, mode: ConsultMode): string {
  if (kind === 'follow_up') return 'Follow-up: List O, A and B medicines may be prescribed.';
  return mode === 'video'
    ? 'First consultation by video: List O and List A medicines may be prescribed.'
    : `First consultation by ${mode}: only List O medicines may be prescribed.`;
}

/** Shown beside the consent checkbox when booking (TPG 2020 §3.3: consent recorded for every teleconsultation). */
export const TPG_CONSENT_TEXT =
  'I consent to a teleconsultation with this doctor under the Telemedicine Practice Guidelines, 2020. I understand the doctor ' +
  'cannot examine me physically, may ask me to visit in person, and may prescribe only medicines the guidelines allow for this ' +
  'kind of consultation. Schedule X and narcotic medicines are never prescribed online.';

export const REVIEW_TABS: readonly { value: DoctorReviewStatus | ''; label: string }[] = [
  { value: 'pending', label: 'Waiting for check' },
  { value: 'verified', label: 'Verified' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
];

export function patientLine(age: number | null | undefined, gender: string | null | undefined): string {
  const parts = [age != null ? `${age} y` : null, gender ? gender : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'age / gender not given';
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: 'Unpaid',
  paid: 'Paid',
  waived: 'No fee',
  refund_pending: 'Refund in progress',
  refunded: 'Refunded',
};

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT_STATUS_LABELS[status] ?? status.replace(/_/g, ' ');
}

/** Toast after a cancellation: the refund may be created at once or queued (pending) */
export function cancelRefundText(refund: CancelResult['refund']): string {
  if (!refund) return 'Cancelled';
  if ('pending' in refund) return `Cancelled. Refund of ${formatPaise(refund.amount_paise)} initiated.`;
  return `Cancelled. ${formatPaise(refund.amount_paise)} will be refunded to your payment method.`;
}
