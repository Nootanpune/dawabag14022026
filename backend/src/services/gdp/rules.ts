// Pure rules of Good Distribution Practice records per batch (Sprint 40; handover D17 /
// D19; Rulebook C-25 cold chain and storage, C-28 recall readiness, C-34 records kept).
//   Events: received (written by the goods receipt), storage check, temperature reading,
//   excursion, excursion disposition, transfer, dispatch.
//   A cold-chain reading outside 2–8 °C IS an excursion (the database turns it into one).
//   An excursion on a cold-chain batch puts the batch ON HOLD — not sellable, not
//   allocatable, not packable, not dispatchable — until a pharmacist with a valid
//   registration records a disposition: release (with a justification), quarantine
//   (still held; waits for release or destruction) or destroy (Dawabag: a write-off
//   raised for the destruction register; partner: the partner destroys under its licence).
// No database imports: unit-tested in rules.test.ts.

export const EVENT_KINDS = ['received', 'storage_check', 'temperature_reading', 'excursion', 'excursion_disposition', 'transfer', 'dispatch'] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** What a person records by hand (received comes from the GRN; dispositions have their own form). */
export const MANUAL_KINDS = ['storage_check', 'temperature_reading', 'excursion', 'transfer', 'dispatch'] as const;
export type ManualKind = (typeof MANUAL_KINDS)[number];

export const DISPOSITIONS = ['release', 'quarantine', 'destroy'] as const;
export type Disposition = (typeof DISPOSITIONS)[number];

export const GDP_STATUSES = ['ok', 'on_hold', 'quarantined', 'destroyed'] as const;
export type GdpStatus = (typeof GDP_STATUSES)[number];

/** Refrigerated (cold-chain) range, °C (C-25). */
export const COLD_MIN_C = 2;
export const COLD_MAX_C = 8;

export const outsideColdRange = (t: number) => t < COLD_MIN_C || t > COLD_MAX_C;

/** Only 'ok' batches may be offered, allocated, packed or dispatched (SQL: alias.gdp_status = 'ok'). */
export const gdpSellableSql = (alias: string) => `${alias}.gdp_status = 'ok'`;

export interface EventInput {
  event_kind: string;
  temperature_c?: number | null;
  storage_condition?: string | null;
  location?: string | null;
  notes?: string | null;
}

/** Plain reasons a hand-recorded event cannot be saved (empty = fine). */
export function eventInputProblems(i: EventInput): string[] {
  const p: string[] = [];
  if (!(MANUAL_KINDS as readonly string[]).includes(i.event_kind)) {
    return ['Choose a storage check, temperature reading, excursion, transfer or dispatch'];
  }
  const t = i.temperature_c;
  if (t != null && (!Number.isFinite(t) || t < -80 || t > 80)) p.push('Enter a temperature between -80 and 80 °C');
  if (i.event_kind === 'temperature_reading' && t == null) p.push('Enter the temperature read (°C)');
  if (i.event_kind === 'excursion' && String(i.notes ?? '').trim().length < 5) {
    p.push('Describe the excursion: what happened, for how long, the highest / lowest temperature (at least 5 characters)');
  }
  if (i.event_kind === 'transfer' && String(i.location ?? '').trim().length < 2) p.push('Enter where the batch was moved to');
  return p;
}

/** The event that will be stored: a cold-chain reading outside 2–8 °C becomes an excursion. */
export function effectiveKind(kind: string, coldChain: boolean, t: number | null | undefined): string {
  return kind === 'temperature_reading' && coldChain && t != null && outsideColdRange(t) ? 'excursion' : kind;
}

export interface DispositionInput { disposition: string; justification?: string | null }

export function dispositionProblems(i: DispositionInput): string[] {
  const p: string[] = [];
  if (!(DISPOSITIONS as readonly string[]).includes(i.disposition)) return ['Choose release, quarantine or destroy'];
  const j = String(i.justification ?? '').trim();
  if (i.disposition === 'release' && j.length < 20) {
    p.push('Explain why the batch is still fit to sell (at least 20 characters): e.g. the data-logger record, the manufacturer\'s stability data');
  } else if (j.length < 10) p.push('Give the reason for this decision (at least 10 characters)');
  return p;
}

/** The hold standing after a disposition (the database computes the same from all records). */
export function statusAfter(d: Disposition): GdpStatus {
  return d === 'release' ? 'ok' : d === 'quarantine' ? 'quarantined' : 'destroyed';
}

/** Buyer-facing never; staff words for a hold. */
export function holdMessage(status: string, label: string): string | null {
  if (status === 'ok') return null;
  if (status === 'on_hold') return `${label} is on GDP hold: a cold-chain excursion waits for a pharmacist's disposition (C-25)`;
  if (status === 'quarantined') return `${label} is quarantined by a pharmacist and cannot be supplied (C-25)`;
  return `${label} is to be destroyed after a cold-chain excursion and cannot be supplied (C-25)`;
}

/** Storage condition written on the "received" record of a goods receipt. */
export function receivedStorageCondition(coldChain: boolean, storageInstructions: string | null | undefined): string {
  const s = String(storageInstructions ?? '').trim();
  if (s) return s.slice(0, 160);
  return coldChain ? `Refrigerated ${COLD_MIN_C}–${COLD_MAX_C} °C` : 'Store below 30 °C, dry, away from light';
}
