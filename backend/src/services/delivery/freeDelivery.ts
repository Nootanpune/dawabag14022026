// Free delivery for retail orders above an amount the owner sets
// (app_settings 'delivery.free_above_paise'; null = off). The same rule prices
// the order and tells the cart how far the buyer is from it, so the apps never
// compute or store it themselves.
import { PoolClient } from 'pg';
import { getSetting } from '../settings.service';

export const FREE_DELIVERY_KEY = 'delivery.free_above_paise';

export async function freeDeliveryAbovePaise(db?: Pick<PoolClient, 'query'>): Promise<number | null> {
  const v = await getSetting<number | null>(FREE_DELIVERY_KEY, null, db);
  return typeof v === 'number' && v >= 0 ? v : null;
}

/** Items value = medicines after any coupon, before GST and delivery. */
export function qualifiesForFreeDelivery(abovePaise: number | null, itemsValuePaise: number): boolean {
  return abovePaise !== null && itemsValuePaise >= abovePaise;
}

/** What the cart shows: the threshold and how much more is needed (0 = free). */
export function freeDeliveryProgress(abovePaise: number | null, itemsValuePaise: number) {
  if (abovePaise === null) return null;
  return { above_paise: abovePaise, remaining_paise: Math.max(0, abovePaise - itemsValuePaise) };
}
