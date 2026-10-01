// No selling price above the MRP printed on stock still on the shelf (Legal
// Metrology / DPCO; C-16). Goods receipt checks this as stock arrives; this
// check covers price changes made afterwards.
import { PoolClient } from 'pg';
import { query } from '../config/database';
import { AppError } from '../utils/AppError';

const PRICES = ['offer_price_paise', 'ptr_price_paise', 'pts_price_paise', 'institutional_price_paise'] as const;

export async function assertBelowShelfMrp(productId: string, prices: Record<string, unknown>, client?: Pick<PoolClient, 'query'>) {
  const sql = `SELECT MIN(printed_mrp_paise)::int AS mrp FROM inventory_batches
               WHERE product_id = $1 AND quantity_available > 0 AND printed_mrp_paise IS NOT NULL`;
  const mrp = (client ? (await client.query(sql, [productId])).rows[0] : (await query<{ mrp: number | null }>(sql, [productId]))[0])?.mrp;
  if (mrp == null) return;
  const above = PRICES.filter((k) => prices[k] != null && Number(prices[k]) > mrp);
  if (above.length) {
    throw new AppError(`${above.map((k) => k.replace('_price_paise', '').toUpperCase()).join('/')} price is above the ₹${(mrp / 100).toFixed(2)} MRP printed on stock still on the shelf (C-16)`, 400);
  }
}
