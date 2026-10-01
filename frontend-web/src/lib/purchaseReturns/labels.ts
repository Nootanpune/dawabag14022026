// Display text for purchase returns and the client-side form checks (the server re-checks everything).
import { formatPaise } from '../admin/format';
import type { Batch } from '../stock/types';
import type { PurchaseReturnReason, PurchaseReturnStatus } from './types';

export const RETURN_REASON_LABELS: Record<PurchaseReturnReason, string> = {
  recalled: 'Recalled batch',
  expired: 'Expired',
  near_expiry: 'Near expiry',
  damaged: 'Damaged',
  excess: 'Excess stock',
  wrong_item: 'Wrong item supplied',
};

export const RETURN_TABS: readonly { value: PurchaseReturnStatus | ''; label: string }[] = [
  { value: 'requested', label: 'Awaiting approval' },
  { value: 'approved', label: 'To dispatch' },
  { value: 'dispatched', label: 'Awaiting credit note' },
  { value: 'settled', label: 'Settled' },
  { value: 'rejected', label: 'Rejected' },
  { value: '', label: 'All' },
];

/** Units that can leave a batch now: available minus reserved for orders. */
export const freeQty = (b: Pick<Batch, 'quantity_available' | 'quantity_reserved'>) =>
  Math.max(0, b.quantity_available - b.quantity_reserved);

/** "short by ₹10.00" / "over by ₹5.00" for the supplier credit vs the return total; '' when equal. */
export function creditDifferenceText(differencePaise: number): string {
  if (!differencePaise) return '';
  return `${differencePaise < 0 ? 'short by' : 'over by'} ${formatPaise(Math.abs(differencePaise))}`;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (s: string) => DATE.test(s);
