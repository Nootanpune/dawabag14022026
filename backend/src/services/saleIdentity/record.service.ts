// Records the sale identity of every shipment of an order, inside the order-placement
// transaction (Sprint 42, rules.ts): the seller's licences as on the day of sale, the
// licence each line is sold under, the sale channel and buyer type, and a licensed trade
// buyer's licences. Written once; from then on the trigger order_shipments_identity_final
// (migration 37) refuses any change (C-05, C-07, C-13, C-33, C-46).
import { PoolClient } from 'pg';
import { dawabagDrugLicences, listLicences, snapshot } from '../licences/register.service';
import { todayIST } from '../../utils/ist';
import { SaleKind } from '../stock/sellingRights';
import { channelFor, lineForm, lineLicence, priceFieldWord, SnapLicence, usedLicences } from './rules';

export interface SaleContext {
  saleKind: SaleKind;
  /** the buyer's price type at the sale (customer_type once KYC-approved and licences in date) */
  buyerType: string;
  /** the products column the lines were priced from, e.g. 'ptr_price_paise' */
  priceColumn: string;
}

export async function recordSaleIdentityTx(client: PoolClient, orderId: string, ctx: SaleContext): Promise<void> {
  const today = todayIST();
  const channel = channelFor(ctx.saleKind);
  const priceField = priceFieldWord(ctx.priceColumn);
  const order = (await client.query(`SELECT buyer_drug_licences FROM orders WHERE id = $1`, [orderId])).rows[0];
  const shipments = (await client.query(`SELECT id, seller_type, partner_id FROM order_shipments WHERE order_id = $1`, [orderId])).rows;
  const lines = (await client.query(
    `SELECT oi.id, oi.shipment_id, p.schedule_c_c1 FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1 AND oi.shipment_id IS NOT NULL`, [orderId])).rows;
  let own: SnapLicence[] | null = null;
  for (const sh of shipments) {
    // The seller of record's checked licences now — the day of sale (C-13)
    const held: SnapLicence[] = sh.seller_type === 'partner' && sh.partner_id
      ? snapshot((await listLicences({ vendorId: sh.partner_id }, { client })).filter((l) => l.status === 'verified'))
      : (own ??= snapshot(await dawabagDrugLicences(client)));
    const used: { form: string; number: string | null }[] = [];
    for (const l of lines.filter((x) => x.shipment_id === sh.id)) {
      const form = lineForm(channel, !!l.schedule_c_c1);
      const lic = lineLicence(held, form, today);
      used.push({ form, number: lic?.number ?? null });
      await client.query(
        `UPDATE order_items SET sale_licence_form = $2, sale_licence_number = $3, price_field = $4 WHERE id = $1`,
        [l.id, form, lic?.number ?? null, priceField]);
    }
    await client.query(
      `UPDATE order_shipments SET seller_drug_licences = $2, sale_licences = $3, sale_channel = $4, sale_buyer_type = $5,
              buyer_drug_licences = $6, sale_identity_frozen_at = NOW(), sale_identity_source = 'sale'
       WHERE id = $1`,
      [sh.id, JSON.stringify(held), JSON.stringify(usedLicences(held, used)), channel, ctx.buyerType,
       order?.buyer_drug_licences == null ? null : JSON.stringify(order.buyer_drug_licences)]);
  }
}
