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
  /** may be left out when the courier was booked through the server (Sprint 8): it uses the stored AWB */
  courier_partner?: string;
  awb_number?: string;
  seal_number: string;
  /** cold-chain shipments only: pack temperature at dispatch, must be 2–8 °C (C-25) */
  cold_chain_temp_c?: number;
  /** cold-chain shipments only: temperature data logger / validated pack id (C-25) */
  cold_chain_logger_id?: string;
}

export interface ColdChainValues {
  temp: string;
  logger: string;
}

/** Mirrors the server's cold-chain dispatch check (C-25); '' when fine. */
export function coldChainError(v: ColdChainValues): string {
  const t = Number(v.temp.replace(',', '.'));
  if (!v.temp.trim() || !Number.isFinite(t)) return 'Enter the pack temperature in °C';
  if (t < 2 || t > 8) return `Pack is at ${t} °C; refrigerated items must leave at 2–8 °C`;
  if (v.logger.trim().length < 2) return 'Enter the temperature logger / pack ID';
  return '';
}

/** Adds the cold-chain fields to a dispatch body when the shipment is cold-chain. */
export function withColdChain(body: DispatchInput, coldChain: boolean, v: ColdChainValues): DispatchInput {
  if (!coldChain) return body;
  return { ...body, cold_chain_temp_c: Number(v.temp.replace(',', '.')), cold_chain_logger_id: v.logger.trim() };
}

export interface HandoverInput {
  code?: string;
  received_by_name?: string;
  received_by_relation?: ReceiverRelation;
  /** admin only, min 10 characters */
  override_reason?: string;
}

/**
 * Client-side mirror of dispatchSchema; returns an error message or ''.
 * `booked`: the shipment already has an AWB on the server, so courier and AWB may be blank.
 */
export function dispatchError(d: DispatchInput, booked = false): string {
  const courier = (d.courier_partner ?? '').trim();
  const awb = (d.awb_number ?? '').trim();
  if ((!booked || courier) && courier.length < 2) return 'Enter the courier name';
  if ((!booked || awb) && awb.length < 3) return 'Enter the AWB / tracking number';
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
