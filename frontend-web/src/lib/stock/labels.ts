// Display text and sign rules for stock adjustments (server enforces the same).
import type { AdjustmentReason, DisposalMethod, ExpiryFilter } from './types';

export const REASON_LABELS: Record<AdjustmentReason, string> = {
  damaged: 'Damaged',
  expired: 'Expired',
  recalled: 'Recalled',
  count_variance: 'Count variance',
  theft_loss: 'Theft / loss',
  found: 'Found',
  return_to_supplier: 'Returned to supplier',
  sample: 'Sample',
};

/** Which direction a reason may move stock: 'found' adds, count_variance either way, the rest remove. */
export function reasonDirection(r: AdjustmentReason): 'add' | 'remove' | 'either' {
  if (r === 'found') return 'add';
  if (r === 'count_variance') return 'either';
  return 'remove';
}

/** Write-offs that must be destroyed and entered in the destruction register (C-28, C-34). */
export const DESTROY_REASONS: readonly AdjustmentReason[] = ['damaged', 'expired', 'recalled'];

export const DISPOSAL_LABELS: Record<DisposalMethod, string> = {
  incineration: 'Incineration',
  authorised_vendor: 'Authorised waste vendor',
  returned_to_manufacturer: 'Returned to manufacturer',
};

export const EXPIRY_TABS: readonly { value: ExpiryFilter | ''; label: string }[] = [
  { value: '', label: 'All batches' },
  { value: 'expired', label: 'Expired' },
  { value: 'near', label: 'Near expiry' },
  { value: 'ok', label: 'In date' },
];
