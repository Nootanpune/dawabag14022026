// src/services/creditNote.service.ts — GST credit notes (Rulebook C-30, C-37)
// A cancellation or an approved return reverses the seller's tax invoice with a
// credit note in the seller's own gap-free series: '<invoice prefix>-CN/<FY>/n'.
// Amounts are the invoiced line values pro-rated by quantity, split into the
// same CGST/SGST/IGST heads as the invoice.
import { PoolClient } from 'pg';
import { AppError } from '../utils/AppError';

export interface CreditLine { order_item_id: string; quantity: number }

export interface IssuedCreditNote {
  id: string;
  credit_note_number: string;
  taxable_paise: number;
  gst_paise: number;
  total_paise: number;
  partner_id: string | null;
}

export async function issueCreditNote(
  client: PoolClient,
  input: { shipmentId: string; reason: string; lines: CreditLine[]; returnId?: string | null; userId: string | null },
): Promise<IssuedCreditNote> {
  const shipment = (await client.query(
    `SELECT id, order_id, invoice_number, partner_id FROM order_shipments WHERE id = $1`, [input.shipmentId])).rows[0];
  if (!shipment) throw new AppError('Shipment not found', 404);

  const items = (await client.query(
    `SELECT id, quantity, line_total_paise, gst_amount_paise, cgst_paise, sgst_paise, igst_paise
     FROM order_items WHERE shipment_id = $1 AND id = ANY($2::uuid[])`,
    [input.shipmentId, input.lines.map((l) => l.order_item_id)])).rows;
  const byId = new Map(items.map((i: any) => [i.id, i]));

  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  const computed = input.lines.map((l) => {
    const it: any = byId.get(l.order_item_id);
    if (!it) throw new AppError('Line is not on this shipment', 400);
    if (l.quantity > it.quantity) throw new AppError('Credit quantity exceeds the invoiced quantity', 400);
    const share = (v: number) => Math.round((Number(v) * l.quantity) / it.quantity);
    const lineGst = share(it.gst_amount_paise);
    const lineTaxable = share(it.line_total_paise) - lineGst;
    const c = share(it.cgst_paise), s = share(it.sgst_paise), i = share(it.igst_paise);
    taxable += lineTaxable; cgst += c; sgst += s; igst += i;
    return { ...l, taxable: lineTaxable, gst: c + s + i };
  });

  const prefix = `${String(shipment.invoice_number).split('/')[0]}-CN`;
  const number = (await client.query(`SELECT next_invoice_number($1, $2) AS n`, [`CN:${prefix}`, prefix])).rows[0].n;
  const gst = cgst + sgst + igst;
  const cn = (await client.query(
    `INSERT INTO credit_notes (credit_note_number, shipment_id, order_id, return_id, reason,
       taxable_paise, cgst_paise, sgst_paise, igst_paise, total_paise, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [number, shipment.id, shipment.order_id, input.returnId ?? null, input.reason,
     taxable, cgst, sgst, igst, taxable + gst, input.userId])).rows[0];
  for (const l of computed) {
    await client.query(
      `INSERT INTO credit_note_items (credit_note_id, order_item_id, quantity, taxable_paise, gst_paise)
       VALUES ($1, $2, $3, $4, $5)`, [cn.id, l.order_item_id, l.quantity, l.taxable, l.gst]);
  }
  return { id: cn.id, credit_note_number: number, taxable_paise: taxable, gst_paise: gst,
    total_paise: taxable + gst, partner_id: shipment.partner_id };
}

// Credit notes for every open line of a shipment (cancellation)
export async function creditWholeShipment(client: PoolClient, shipmentId: string, reason: string, userId: string | null) {
  const lines = (await client.query(
    `SELECT id AS order_item_id, quantity FROM order_items WHERE shipment_id = $1`, [shipmentId])).rows;
  if (!lines.length) return null;
  return issueCreditNote(client, { shipmentId, reason, lines, userId });
}
