// src/services/checkoutSummary.service.ts — what the buyer must see before
// paying (Rulebook C-35): seller of record and licence per shipment, price
// break-up, delivery estimate, country of origin, and the policies that apply.
// Built from the tentative order inside the placement transaction, which the
// preview then rolls back — so it shows exactly what placing would do.
import { PoolClient } from 'pg';
import { licenceLine } from './licences/forms';
import { dawabagDrugLicences, listLicences, snapshot } from './licences/register.service';

export class OrderPreview extends Error {
  constructor(public summary: any) { super('order preview'); }
}

export async function buildCheckoutSummary(client: PoolClient, orderId: string, pincode: string, tradeBuyer: boolean) {
  const o = (await client.query(
    `SELECT subtotal_paise, gst_paise, shipping_paise, discount_paise, wallet_used_paise, total_paise, payment_terms
     FROM orders WHERE id = $1`, [orderId])).rows[0];
  const pin = (await client.query(
    `SELECT estimated_days, dawabag_delivery_hours FROM pincode_serviceability WHERE pincode = $1`, [pincode])).rows[0];
  const entity = (await client.query(`SELECT value FROM app_settings WHERE key = 'legal.entity'`)).rows[0]?.value || {};
  // Dawabag's licences from its register (C-07): wholesale ones to trade buyers, retail ones to patients
  const own = (await dawabagDrugLicences(client)).filter((l) => (tradeBuyer ? ['dl20b', 'dl21b'] : ['dl20', 'dl21']).includes(l.form));
  const ownList = snapshot(own);

  const shipments = (await client.query(
    `SELECT s.id, s.seller_type, s.subtotal_paise, s.gst_paise, s.total_paise, s.cold_chain,
            s.partner_id, v.name AS partner_name, v.drug_license_no, v.city AS partner_city
     FROM order_shipments s LEFT JOIN vendors v ON v.id = s.partner_id WHERE s.order_id = $1
     ORDER BY s.seller_type, v.name`, [orderId])).rows;
  const partnerLicences = new Map<string, ReturnType<typeof snapshot>>();
  for (const s of shipments) {
    if (s.partner_id && !partnerLicences.has(s.partner_id)) {
      partnerLicences.set(s.partner_id, snapshot((await listLicences({ vendorId: s.partner_id }, { client })).filter((l) => l.status === 'verified')));
    }
  }
  const lines = (await client.query(
    `SELECT oi.shipment_id, oi.product_id, oi.product_name, oi.quantity, oi.unit_price_paise, oi.mrp_paise,
            oi.gst_rate, oi.line_total_paise, p.drug_schedule, p.net_quantity,
            COALESCE(p.manufacturer_name, p.marketed_by) AS manufacturer, COALESCE(p.country_of_origin, 'India') AS country_of_origin,
            COALESCE(ib.expiry_date, pi.expiry_date) AS batch_expiry
     FROM order_items oi JOIN products p ON p.id = oi.product_id
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
     WHERE oi.order_id = $1 ORDER BY oi.product_name`, [orderId])).rows;
  const policies = (await client.query(
    `SELECT DISTINCT ON (doc_key) doc_key, version, title, effective_from FROM policy_documents
     WHERE doc_key IN ('refund', 'cancellation', 'shipping') AND effective_from <= CURRENT_DATE
     ORDER BY doc_key, version DESC`)).rows;

  const days = Number(pin?.estimated_days ?? 5);
  return {
    shipments: shipments.map((s: any) => ({
      seller_type: s.seller_type,
      seller_name: s.seller_type === 'dawabag' ? entity.name || 'Dawabag' : s.partner_name,
      // every licence of the seller of record (Sprint 30): one line, and the list
      seller_licence: licenceLine((s.seller_type === 'dawabag' ? ownList : partnerLicences.get(s.partner_id) ?? [])
        .map((l) => ({ form: l.form, form_name: l.label, licence_number: l.number }))) ?? (s.seller_type === 'dawabag' ? null : s.drug_license_no),
      seller_licences: s.seller_type === 'dawabag' ? ownList : partnerLicences.get(s.partner_id) ?? [],
      ships_from: s.seller_type === 'dawabag' ? null : s.partner_city,
      delivery_estimate: s.seller_type === 'dawabag' && pin?.dawabag_delivery_hours
        ? `Within ${pin.dawabag_delivery_hours} hours` : `Within ${days} day${days === 1 ? '' : 's'}`,
      cold_chain: s.cold_chain,
      subtotal_paise: s.subtotal_paise, gst_paise: s.gst_paise, total_paise: s.total_paise,
      lines: lines.filter((l: any) => l.shipment_id === s.id).map(({ shipment_id, ...l }: any) => ({
        ...l, batch_expiry: l.batch_expiry ? new Date(l.batch_expiry).toISOString().slice(0, 7) : null })),
    })),
    charges: {
      items_paise: o.subtotal_paise, gst_paise: o.gst_paise, delivery_paise: o.shipping_paise,
      discount_paise: o.discount_paise, wallet_paise: o.wallet_used_paise, total_payable_paise: o.total_paise,
    },
    payment_terms: o.payment_terms,
    returns_note: 'Medicines cannot be returned once delivered unless damaged, wrong, missing, expired, near expiry or recalled.',
    policies,
  };
}
