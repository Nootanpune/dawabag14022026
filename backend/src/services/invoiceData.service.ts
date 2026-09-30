// src/services/invoiceData.service.ts
// Everything a GST tax invoice for one shipment must show, read from the
// database (the only authority — the PDF is rendered on demand, never stored).
// Seller = the shipment's seller of record (Dawabag or partner, C-05).
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { sameState } from './shipment.service';

const PAN_ON_INVOICE_ABOVE_PAISE = 2_00_000_00;   // ₹2,00,000 for unregistered buyers (URS v3.1)

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: Date;
  orderNumber: string;
  seller: { name: string; address: string; state: string | null; gstin: string | null; drugLicence: string | null };
  buyer: { name: string; address: string; state: string | null; gstin: string | null; pan: string | null; drugLicence: string | null; unregistered: boolean };
  interState: boolean;
  irn: string | null;
  lines: {
    name: string; hsn: string | null; batch: string | null; expiry: string | null; manufacturer: string | null;
    qty: number; mrpPaise: number; ratePaise: number; taxablePaise: number; gstRate: number;
    cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number;
  }[];
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number };
}

export async function loadInvoice(shipmentId: string): Promise<InvoiceData> {
  const s = await queryOne<any>(
    `SELECT s.*, o.order_number, o.created_at AS order_date, o.buyer_gstin, o.buyer_pan, o.buyer_drug_license, o.irn,
            a.full_name AS ship_name, concat_ws(', ', a.address_line1, a.city, a.state, a.pincode) AS ship_address, a.state AS ship_state,
            u.business_name, up.full_name AS buyer_name,
            v.name AS partner_name, concat_ws(', ', v.address_line1, v.city, v.state, v.pincode) AS partner_address,
            v.state AS partner_state, v.gst_number AS partner_gstin, v.drug_license_no AS partner_dl
     FROM order_shipments s
     JOIN orders o ON o.id = s.order_id
     JOIN addresses a ON a.id = o.address_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN user_profiles up ON up.user_id = o.user_id
     LEFT JOIN vendors v ON v.id = s.partner_id
     WHERE s.id = $1`, [shipmentId]);
  if (!s) throw new AppError('Shipment not found', 404);

  const [entity, licences] = await Promise.all([
    queryOne<{ value: any }>(`SELECT value FROM app_settings WHERE key = 'legal.entity'`),
    queryOne<{ value: any }>(`SELECT value FROM app_settings WHERE key = 'legal.drug_licences'`),
  ]);
  const seller = s.seller_type === 'partner'
    ? { name: s.partner_name, address: s.partner_address, state: s.partner_state, gstin: s.partner_gstin, drugLicence: s.partner_dl }
    : {
        name: entity?.value?.name || 'Dawabag Private Limited',
        address: entity?.value?.address || '',
        state: entity?.value?.state || 'Maharashtra',
        gstin: entity?.value?.gstin || null,
        drugLicence: [licences?.value?.retail_20, licences?.value?.retail_21, licences?.value?.wholesale_20b, licences?.value?.wholesale_21b]
          .filter(Boolean).join(' / ') || null,
      };

  const lines = (await query<any>(
    `SELECT oi.product_name, p.hsn_code, p.marketed_by, oi.quantity, oi.mrp_paise, oi.unit_price_paise, oi.gst_rate,
            oi.cgst_paise, oi.sgst_paise, oi.igst_paise, oi.gst_amount_paise, oi.line_total_paise,
            COALESCE(ib.batch_number, pi.batch_number) AS batch, COALESCE(ib.expiry_date, pi.expiry_date) AS expiry
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
     WHERE oi.shipment_id = $1 ORDER BY oi.product_name`, [shipmentId])).map((l) => ({
    name: l.product_name, hsn: l.hsn_code, manufacturer: l.marketed_by, batch: l.batch,
    expiry: l.expiry ? new Date(l.expiry).toISOString().slice(0, 7) : null,
    qty: l.quantity, mrpPaise: l.mrp_paise, ratePaise: l.unit_price_paise,
    taxablePaise: l.unit_price_paise * l.quantity, gstRate: l.gst_rate,
    cgstPaise: l.cgst_paise, sgstPaise: l.sgst_paise, igstPaise: l.igst_paise, totalPaise: l.line_total_paise,
  }));
  const sum = (k: keyof (typeof lines)[number]) => lines.reduce((t, l) => t + Number(l[k]), 0);
  const totals = { taxablePaise: sum('taxablePaise'), cgstPaise: sum('cgstPaise'), sgstPaise: sum('sgstPaise'),
    igstPaise: sum('igstPaise'), totalPaise: sum('totalPaise') };

  const unregistered = !s.buyer_gstin;
  return {
    invoiceNumber: s.invoice_number,
    invoiceDate: s.created_at,
    orderNumber: s.order_number,
    seller,
    buyer: {
      name: s.business_name || s.buyer_name || s.ship_name,
      address: `${s.ship_name}, ${s.ship_address}`,
      state: s.ship_state,
      gstin: s.buyer_gstin,
      unregistered,
      // PAN printed for unregistered buyers above ₹2,00,000
      pan: unregistered && totals.totalPaise > PAN_ON_INVOICE_ABOVE_PAISE ? s.buyer_pan : null,
      drugLicence: s.buyer_drug_license,
    },
    interState: !sameState(seller.state, s.ship_state),
    irn: s.seller_type === 'dawabag' ? s.irn : null,
    lines, totals,
  };
}
