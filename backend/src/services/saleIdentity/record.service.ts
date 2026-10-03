// Records the sale identity of a shipment (Sprint 42, rules.ts): the seller's licences as on
// the day of sale, the licence each line is sold under, the sale channel and buyer type, a
// licensed trade buyer's licences and — Sprint 44 — a doctor / institution buyer's council
// registration (Drugs Rules r.65(9)(b); FDA Pune circular Drug/Wholesalers Memo./16/2026/1).
// Written once; from then on the trigger order_shipments_identity_final (migrations 37, 39)
// refuses any change (C-05, C-07, C-13, C-33, C-46).
//
// Sprint 44 (owner decision CONFIRMED 2026-10-03): the moment of sale is the TAX INVOICE,
// issued when a registered pharmacist releases the shipment. recordShipmentSaleIdentityTx
// runs in that release transaction, just before the release row update whose trigger takes
// the invoice number — so the invoice and its sale record carry the same day and the lines
// as finally supplied (the buyer may change the order until then). The seller of record was
// chosen at placement (allocation) and does not change; shipments invoiced at placement
// before Sprint 44 keep the record frozen then.
import { PoolClient } from 'pg';
import { dawabagDrugLicences, listLicences, snapshot } from '../licences/register.service';
import { todayIST } from '../../utils/ist';
import { SaleKind, saleKindFor } from '../stock/sellingRights';
import { effectiveCustomerType, priceField } from '../../utils/customerType';
import { practitionerState } from '../practitionerSales/registration.service';
import { channelFor, lineForm, lineLicence, priceFieldWord, SnapLicence, usedLicences } from './rules';

export interface SaleContext {
  saleKind: SaleKind;
  /** the buyer's price type at the sale (customer_type once KYC-approved and licences in date) */
  buyerType: string;
  /** the products column the lines were priced from, e.g. 'ptr_price_paise' */
  priceColumn: string;
}

/** The order's sale context: the price type the order was placed (and priced) under. */
export async function saleContextFor(client: PoolClient, orderId: string): Promise<SaleContext> {
  const o = (await client.query(
    `SELECT o.pricing_type, u.customer_type, u.kyc_status FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [orderId])).rows[0];
  const type = (o?.pricing_type || effectiveCustomerType(o?.customer_type, o?.kyc_status)) as any;
  return { saleKind: saleKindFor(type), buyerType: type, priceColumn: priceField(type) };
}

/** Freezes one shipment's sale record (no-op when already frozen, e.g. invoiced before Sprint 44). */
export async function recordShipmentSaleIdentityTx(client: PoolClient, shipmentId: string, ctx?: SaleContext): Promise<void> {
  const sh = (await client.query(
    `SELECT s.id, s.order_id, s.seller_type, s.partner_id, s.sale_identity_frozen_at, o.buyer_drug_licences, o.user_id
     FROM order_shipments s JOIN orders o ON o.id = s.order_id WHERE s.id = $1 FOR UPDATE OF s`, [shipmentId])).rows[0];
  if (!sh || sh.sale_identity_frozen_at) return;
  const c = ctx ?? await saleContextFor(client, sh.order_id);
  const today = todayIST();
  const channel = channelFor(c.saleKind);
  const priceFieldName = priceFieldWord(c.priceColumn);
  // The seller of record's checked licences now — the day of sale (C-13)
  const held: SnapLicence[] = sh.seller_type === 'partner' && sh.partner_id
    ? snapshot((await listLicences({ vendorId: sh.partner_id }, { client })).filter((l) => l.status === 'verified'))
    : snapshot(await dawabagDrugLicences(client));
  const lines = (await client.query(
    `SELECT oi.id, p.schedule_c_c1 FROM order_items oi JOIN products p ON p.id = oi.product_id
     WHERE oi.shipment_id = $1 AND oi.sale_licence_form IS NULL`, [shipmentId])).rows;
  const used: { form: string; number: string | null }[] = [];
  for (const l of lines) {
    const form = lineForm(channel, !!l.schedule_c_c1);
    const lic = lineLicence(held, form, today);
    used.push({ form, number: lic?.number ?? null });
    await client.query(
      `UPDATE order_items SET sale_licence_form = $2, sale_licence_number = $3, price_field = $4 WHERE id = $1`,
      [l.id, form, lic?.number ?? null, priceFieldName]);
  }
  // A doctor / institution buyer's registration as on the day of sale (r.65(9)(b) records)
  const pr = await practitionerState(client, sh.user_id);
  await client.query(
    `UPDATE order_shipments SET seller_drug_licences = $2, sale_licences = $3, sale_channel = $4, sale_buyer_type = $5,
            buyer_drug_licences = $6, buyer_registration = $7, sale_identity_frozen_at = NOW(), sale_identity_source = 'sale'
     WHERE id = $1`,
    [shipmentId, JSON.stringify(held), JSON.stringify(usedLicences(held, used)), channel, c.buyerType,
     sh.buyer_drug_licences == null ? null : JSON.stringify(sh.buyer_drug_licences),
     pr.applies ? JSON.stringify(pr.snapshot) : null]);
}
