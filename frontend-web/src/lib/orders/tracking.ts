// Buyer-facing wording for courier tracking statuses (normalised by the server).
// A courier "delivered" scan does not close a prescription parcel: handover needs
// the buyer's delivery code (C-26), so the shipment status stays authoritative.

export const TRACKING_LABELS: Record<string, string> = {
  booked: 'Courier booked',
  picked_up: 'Picked up by courier',
  in_transit: 'In transit',
  out_for_delivery: 'Out for delivery',
  delivered: 'Delivered by courier',
  exception: 'Delivery issue',
  rto: 'Returning to Dawabag',
};

export function trackingLabel(status: string | null | undefined): string {
  if (!status) return '';
  return TRACKING_LABELS[status] ?? status.replace(/_/g, ' ');
}
