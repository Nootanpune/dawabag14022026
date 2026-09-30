// Sealed dispatch and delivery handover (Rulebook C-26). The server checks the
// buyer's 6-digit code for prescription shipments, counts wrong attempts (locks
// after 5, HTTP 423) and lets only an admin confirm without the code.

export type ReceiverRelation = 'self' | 'family_adult' | 'other_adult';

export const RECEIVER_RELATIONS: { value: ReceiverRelation; label: string }[] = [
  { value: 'self', label: 'The buyer / patient' },
  { value: 'family_adult', label: 'Adult family member' },
  { value: 'other_adult', label: 'Other adult at the address' },
];

export interface DispatchInput {
  courier_partner: string;
  awb_number: string;
  seal_number: string;
}

export interface HandoverInput {
  code?: string;
  received_by_name?: string;
  received_by_relation?: ReceiverRelation;
  /** admin only, min 10 characters */
  override_reason?: string;
}

/** Client-side mirror of dispatchSchema; returns an error message or ''. */
export function dispatchError(d: DispatchInput): string {
  if (d.courier_partner.trim().length < 2) return 'Enter the courier name';
  if (d.awb_number.trim().length < 3) return 'Enter the AWB / tracking number';
  if (d.seal_number.trim().length < 3) return 'Enter the tamper-evident seal number on the pack';
  return '';
}

/** Mirrors handoverSchema; fields left blank are not sent. */
/** `override` is null unless the admin chose to confirm without the code. */
export function buildHandover(v: { code: string; name: string; relation: string; override: string | null }): HandoverInput {
  const out: HandoverInput = {};
  if (v.code.trim()) out.code = v.code.trim();
  if (v.name.trim()) out.received_by_name = v.name.trim();
  if (v.relation) out.received_by_relation = v.relation as ReceiverRelation;
  if (v.override !== null) out.override_reason = v.override.trim();
  return out;
}

export function handoverError(h: HandoverInput, codeRequired: boolean): string {
  if (h.code && !/^\d{6}$/.test(h.code)) return 'The delivery code has 6 digits';
  if (h.received_by_name && h.received_by_name.length < 2) return "Enter the receiver's name";
  if (h.override_reason !== undefined && h.override_reason.length < 10) return 'Give the override reason (at least 10 characters)';
  if (codeRequired) {
    if (!h.received_by_name || !h.received_by_relation) return 'Record who received the pack';
    if (!h.code && !h.override_reason) return "Enter the buyer's delivery code";
  }
  return '';
}
