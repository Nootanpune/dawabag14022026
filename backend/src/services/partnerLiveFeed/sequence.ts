// Sprint 37 — ordering of live snapshots. The connector numbers every snapshot
// (sequence, never reused) and says when it read the stock (taken_at). Pure: unit-tested.
//   • the same sequence with the same stock again (a retry after a lost answer) →
//     'replay': the earlier answer, nothing changes (idempotent);
//   • the same sequence with different stock → refused (409);
//   • a lower sequence, or an earlier taken_at than the snapshot already applied →
//     refused as out of order (409): an old snapshot never overwrites a newer one;
//   • a newer snapshot with the same stock → 'unchanged': applied again from the
//     stored lines (no new rows), which only re-counts units dispatched since;
//   • taken_at more than MAX_CLOCK_AHEAD_MS in the future → refused (422): the
//     connector's clock is wrong and staleness could not be judged.

export const MAX_CLOCK_AHEAD_MS = 5 * 60_000;

export interface LastSnapshot { sequence: number | null; takenAt: Date | null; sha256: string | null }
export interface IncomingSnapshot { sequence: number; takenAt: Date; sha256: string }

export type SequenceDecision =
  | { action: 'apply' }
  | { action: 'unchanged' }
  | { action: 'replay' }
  | { action: 'reject'; status: 409 | 422; message: string };

export function decideSequence(last: LastSnapshot, inc: IncomingSnapshot, now: Date): SequenceDecision {
  if (Number.isNaN(inc.takenAt.getTime())) return { action: 'reject', status: 422, message: 'taken_at is not a date and time' };
  if (inc.takenAt.getTime() - now.getTime() > MAX_CLOCK_AHEAD_MS) {
    return { action: 'reject', status: 422, message: 'taken_at is in the future: check the clock of the computer running the connector' };
  }
  if (last.sequence === null) return { action: 'apply' };
  if (inc.sequence === last.sequence) {
    return inc.sha256 === last.sha256
      ? { action: 'replay' }
      : { action: 'reject', status: 409, message: `Sequence ${inc.sequence} was already used for a different snapshot; send a new sequence number` };
  }
  if (inc.sequence < last.sequence) {
    return { action: 'reject', status: 409, message: `Out of order: sequence ${inc.sequence} is older than ${last.sequence}, which is already applied` };
  }
  if (last.takenAt && inc.takenAt.getTime() < last.takenAt.getTime()) {
    return { action: 'reject', status: 409, message: `Out of order: taken_at is earlier than the snapshot already applied (${last.takenAt.toISOString()})` };
  }
  return inc.sha256 === last.sha256 ? { action: 'unchanged' } : { action: 'apply' };
}

/** The time Dawabag records for the snapshot: never later than when it arrived. */
export const effectiveTakenAt = (takenAt: Date, receivedAt: Date) => (takenAt > receivedAt ? receivedAt : takenAt);
