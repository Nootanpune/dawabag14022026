// Sprint 32 — whether the signed-in trade buyer's prices are paused by a lapsed drug
// licence. The server decides it live on every request (auth.middleware → the prices
// in search, product page, cart and checkout); this only reads that decision to say
// why the prices are retail (C-14). Nothing is kept on the device.
import api from '../api';
import { formatDateIST } from '../dates';

export interface TradePause {
  form: string;
  label: string;             // "Form 20B"
  licence_number: string;
  expired_on: string;        // YYYY-MM-DD
}

export interface TradePrices {
  pricing_type: string;
  paused: boolean;
  licence: TradePause | null;
}

export const tradePriceKeys = { status: ['trade-prices'] as const };

export async function fetchTradePrices(): Promise<TradePrices> {
  const { data } = await api.get('/users/me/trade-prices');
  return data.data;
}

/** "Your drug licence Form 20 MH-1 expired on 01 Oct 2026 — trade prices are paused until a renewal is checked" */
export function tradePauseText(l: TradePause): string {
  return `Your drug licence ${l.label} ${l.licence_number} expired on ${formatDateIST(l.expired_on)} — trade prices are paused until a renewal is checked`;
}
