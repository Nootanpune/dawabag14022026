// The free-delivery amount for the home page, read from the server each visit
// (GET /delivery/offer → setting delivery.free_above_paise; null = off). Nothing
// is hard-coded or kept on the device: the owner's change in Settings shows at once.
import api from '../api';

export interface DeliveryOffer {
  free_delivery_above_paise: number | null;
}

export const deliveryOfferKeys = { offer: ['delivery', 'offer'] as const };

export async function fetchDeliveryOffer(): Promise<DeliveryOffer> {
  const { data } = await api.get('/delivery/offer');
  return data.data;
}

/** "₹499" for whole rupees, "₹499.50" otherwise, Indian digit grouping ("₹5,000"). */
export function rupees(paise: number): string {
  const whole = paise % 100 === 0;
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** The home-page line, or null when free delivery is off. */
export function freeDeliveryLine(offer: DeliveryOffer | undefined): string | null {
  const paise = offer?.free_delivery_above_paise;
  return typeof paise === 'number' ? `Free delivery on medicines of ${rupees(paise)} or more` : null;
}
