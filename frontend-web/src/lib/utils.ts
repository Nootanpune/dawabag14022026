export function formatPrice(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export const ORDER_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment:  { label: 'Awaiting payment',       color: 'text-yellow-600 bg-yellow-50' },
  payment_failed:   { label: 'Payment failed',          color: 'text-red-600 bg-red-50' },
  rx_pending:       { label: 'Rx verification pending', color: 'text-orange-600 bg-orange-50' },
  rx_verified:      { label: 'Prescription verified',   color: 'text-blue-600 bg-blue-50' },
  rx_rejected:      { label: 'Rx rejected',             color: 'text-red-600 bg-red-50' },
  packing:          { label: 'Being packed',            color: 'text-indigo-600 bg-indigo-50' },
  packed:           { label: 'Packed',                  color: 'text-indigo-600 bg-indigo-50' },
  dispatched:       { label: 'Dispatched',              color: 'text-brand-600 bg-brand-50' },
  delivered:        { label: 'Delivered',               color: 'text-green-700 bg-green-50' },
  cancelled:        { label: 'Cancelled',               color: 'text-gray-600 bg-gray-100' },
  returned:         { label: 'Returned',                color: 'text-gray-600 bg-gray-100' },
};
