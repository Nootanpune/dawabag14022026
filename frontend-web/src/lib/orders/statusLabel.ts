// One status label for an order, the same on "My orders" and the order page (Sprint 43 QA):
// while the pharmacist is checking it, that is what the buyer sees.
import { ORDER_STATUS_LABELS, PHARMACIST_CHECK_LABELS } from '@/lib/utils';

export function orderStatusInfo(order: { status: string; pharmacist_check?: string | null }): { label: string; color: string } {
  const checking = ['confirmed', 'packing', 'rx_verified'].includes(order.status)
    && (order.pharmacist_check === 'pending' || order.pharmacist_check === 'held') ? order.pharmacist_check : null;
  return (checking ? PHARMACIST_CHECK_LABELS[checking] : null) ?? ORDER_STATUS_LABELS[order.status]
    ?? { label: order.status.replace(/_/g, ' '), color: 'text-gray-600 bg-gray-100' };
}
