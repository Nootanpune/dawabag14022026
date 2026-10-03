// src/services/invoiceData.service.ts
// Everything a GST tax invoice for one shipment must show, read from the
// database (the only authority — the PDF is rendered on demand, never stored).
// Seller = the shipment's seller of record (Dawabag or partner, C-05).
import { query, queryOne } from '../config/database';
import { AppError } from '../utils/AppError';
import { sameState } from './shipment.service';
import { dawabagDrugLicences, listLicences, snapshot } from './licences/register.service';
import { TRADE_TYPES } from '../utils/customerType';

const PAN_ON_INVOICE_ABOVE_PAISE = 2_00_000_00;   // ₹2,00,000 for unregistered buyers (URS v3.1)

export interface InvoiceData {
  title?: string;                 // 'TAX INVOICE' (default) or 'CREDIT NOTE'
  againstInvoice?: string;        // credit note: the invoice it reverses
  invoiceNumber: string;
  invoiceDate: Date;
  orderNumber: string;
  // drugLicence: every licence on one line ("Form 20: … · Form 21B: …"); drugLicences: the same as a list (C-13)
  seller: { name: string; address: string; state: string | null; gstin: string | null; drugLicence: string | null; drugLicences: InvoiceLicence[] };
  buyer: { name: string; address: string; state: string | null; gstin: string | null; pan: string | null; drugLicence: string | null;
    drugLicences: InvoiceLicence[]; unregistered: boolean };
  interState: boolean;
  // Registered e-invoice (C-31): printed with its signed QR code
  einvoice: { irn: string; ackNo: string; ackDate: Date; signedQr: string | null } | null;
  lines: {
    orderItemId?: string;
    name: string; hsn: string | null; batch: string | null; expiry: string | null; manufacturer: string | null;
    qty: number; mrpPaise: number; ratePaise: number; taxablePaise: number; gstRate: number;
    cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number;
  }[];
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number };
  /** Dawabag's own invoice carries the DAWA BAG logo; a partner's invoice is the partner's (C-05) */
  sellerType?: 'dawabag' | 'partner';
  /** Sprint 35: the registered pharmacist who checked and released this shipment (C-08); Sprint 42: council as at the check */
  pharmacist?: { name: string; regNo: string; council?: string | null } | null;
  /** Sprint 42: the sale as fixed at order placement — channel and the licences the lines were sold under (C-07, C-13, C-33) */
  sale?: { channel: 'retail' | 'wholesale' | null; licences: InvoiceLicence[]; source: 'sale' | 'backfill' | null };
}

export interface InvoiceLicence { form: string; label: string; number: string; valid_upto: string | null }
const line = (l: InvoiceLicence[]) => (l.length ? l.map((x) => `${x.label}: ${x.number}`).join(' · ') : null);

async function registered(where: string, id: string): Promise<InvoiceData['einvoice']> {
  const e = await queryOne<any>(`SELECT irn, ack_no, ack_date, signed_qr FROM einvoices WHERE ${where} AND status = 'generated'`, [id]);
  return e ? { irn: e.irn, ackNo: e.ack_no, ackDate: e.ack_date, signedQr: e.signed_qr } : null;
}

export async function loadInvoice(shipmentId: string): Promise<InvoiceData> {
  const s = await queryOne<any>(
    `SELECT s.*, o.order_number, o.created_at AS order_date, o.buyer_gstin, o.buyer_pan, o.buyer_drug_license, o.buyer_drug_licences AS order_buyer_drug_licences,
            a.full_name AS ship_name, concat_ws(', ', a.address_line1, a.city, a.state, a.pincode) AS ship_address, a.state AS ship_state,
            u.business_name, up.full_name AS buyer_name,
            v.name AS partner_name, concat_ws(', ', v.address_line1, v.city, v.state, v.pincode) AS partner_address,
            v.state AS partner_state, v.gst_number AS partner_gstin, o.user_id AS buyer_id, u.customer_type AS buyer_type
     FROM order_shipments s
     JOIN orders o ON o.id = s.order_id
     JOIN addresses a ON a.id = o.address_id
     JOIN users u ON u.id = o.user_id
     LEFT JOIN user_profiles up ON up.user_id = o.user_id
     LEFT JOIN vendors v ON v.id = s.partner_id
     WHERE s.id = $1`, [shipmentId]);
  if (!s) throw new AppError('Shipment not found', 404);

  // Licences as on the day of sale: the shipment's frozen sale record (Sprint 42; Sprint 30
  // snapshots; older shipments were filled by migration 37). Only a shipment without one
  // (none since migration 37) would read the register as it is now.
  const entity = await queryOne<{ value: any }>(`SELECT value FROM app_settings WHERE key = 'legal.entity'`);
  const sellerLicences: InvoiceLicence[] = s.seller_drug_licences
    ?? snapshot(s.seller_type === 'partner'
      ? (await listLicences({ vendorId: s.partner_id })).filter((l) => l.status === 'verified')
      : await dawabagDrugLicences());
  const buyerLicences: InvoiceLicence[] = s.buyer_drug_licences ?? s.order_buyer_drug_licences
    ?? (s.buyer_drug_license && TRADE_TYPES.includes(s.buyer_type)
      ? snapshot((await listLicences({ userId: s.buyer_id })).filter((l) => l.status === 'verified')) : []);
  const seller = s.seller_type === 'partner'
    ? { name: s.partner_name, address: s.partner_address, state: s.partner_state, gstin: s.partner_gstin,
        drugLicence: line(sellerLicences), drugLicences: sellerLicences }
    : {
        name: entity?.value?.name || 'Dawabag Private Limited',
        address: entity?.value?.address || '',
        state: entity?.value?.state || 'Maharashtra',
        gstin: entity?.value?.gstin || null,
        drugLicence: line(sellerLicences), drugLicences: sellerLicences,
      };

  const lines = (await query<any>(
    `SELECT oi.id AS order_item_id, oi.product_name, p.hsn_code, COALESCE(p.manufacturer_name, p.marketed_by) AS marketed_by, oi.quantity, oi.mrp_paise, oi.unit_price_paise, oi.gst_rate,
            oi.cgst_paise, oi.sgst_paise, oi.igst_paise, oi.gst_amount_paise, oi.line_total_paise,
            COALESCE(ib.batch_number, pi.batch_number) AS batch, COALESCE(ib.expiry_date, pi.expiry_date) AS expiry
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     LEFT JOIN inventory_batches ib ON ib.id = oi.batch_id
     LEFT JOIN partner_order_items poi ON poi.order_item_id = oi.id
     LEFT JOIN partner_inventory pi ON pi.id = poi.partner_inv_id
     WHERE oi.shipment_id = $1 ORDER BY oi.product_name`, [shipmentId])).map((l) => ({
    orderItemId: l.order_item_id as string,
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
      drugLicence: line(buyerLicences) ?? s.buyer_drug_license, drugLicences: buyerLicences,
    },
    interState: !sameState(seller.state, s.ship_state),
    einvoice: s.seller_type === 'dawabag' ? await registered('shipment_id = $1 AND doc_type = \'INV\'', shipmentId) : null,
    lines, totals,
    sellerType: s.seller_type,
    pharmacist: s.pharmacist_check === 'released' && s.pharmacist_name
      ? { name: s.pharmacist_name, regNo: s.pharmacist_reg_no, council: s.pharmacist_registration?.state_council ?? null } : null,
    sale: { channel: s.sale_channel ?? null, licences: s.sale_licences ?? [], source: s.sale_identity_source ?? null },
  };
}

// A credit note shows the reversed quantities of the original invoice lines (C-30)
export async function loadCreditNote(creditNoteId: string): Promise<InvoiceData> {
  const cn = await queryOne<any>(`SELECT * FROM credit_notes WHERE id = $1`, [creditNoteId]);
  if (!cn) throw new AppError('Credit note not found', 404);
  const inv = await loadInvoice(cn.shipment_id);
  const items = await query<any>(`SELECT order_item_id, quantity, taxable_paise, gst_paise FROM credit_note_items WHERE credit_note_id = $1`, [creditNoteId]);
  const byItem = new Map(items.map((i) => [i.order_item_id, i]));
  const lines = inv.lines.filter((l) => byItem.has(l.orderItemId)).map((l) => {
    const c = byItem.get(l.orderItemId);
    const gst = Number(c.gst_paise);
    const half = inv.interState ? 0 : Math.round(gst / 2);
    return { ...l, qty: c.quantity, taxablePaise: Number(c.taxable_paise), cgstPaise: half,
      sgstPaise: inv.interState ? 0 : gst - half, igstPaise: inv.interState ? gst : 0,
      totalPaise: Number(c.taxable_paise) + gst };
  });
  return {
    ...inv, title: 'CREDIT NOTE', againstInvoice: inv.invoiceNumber,
    invoiceNumber: cn.credit_note_number, invoiceDate: cn.created_at, lines,
    einvoice: await registered('credit_note_id = $1', creditNoteId),
    totals: { taxablePaise: cn.taxable_paise, cgstPaise: cn.cgst_paise, sgstPaise: cn.sgst_paise,
      igstPaise: cn.igst_paise, totalPaise: cn.total_paise },
  };
}
