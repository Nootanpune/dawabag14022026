// src/services/creditNote.service.ts — GST credit notes (Rulebook C-30, C-37)
// Sprint 44: only against an ISSUED invoice (issued at the pharmacist's approval) — a change
// or cancellation before that needs no credit note.
// A cancellation or an approved return reverses the seller's tax invoice with a
// credit note in the seller's own gap-free series: '<invoice prefix>C/<FY>/n'
// (16 characters at most, CGST Rule 46).
// Amounts are the invoiced line values pro-rated by quantity, split into the
// same CGST/SGST/IGST heads as the invoice.
import { PoolClient } from 'pg';
import { AppError } from '../utils/AppError';
import { ensureCreditNoteEinvoice } from './einvoice/einvoice.service';

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
  // Sprint 44: a credit note reverses an issued invoice; before the invoice there is nothing to credit
  if (!shipment.invoice_number) throw new AppError('No tax invoice has been issued for this shipment yet', 409, true, 'INVOICE_NOT_ISSUED');

  const items = (await client.query(
    `SELECT oi.id, oi.quantity, oi.line_total_paise, oi.gst_amount_paise, oi.cgst_paise, oi.sgst_paise, oi.igst_paise,
            COALESCE((SELECT SUM(ci.quantity) FROM credit_note_items ci WHERE ci.order_item_id = oi.id), 0)::int AS credited
     FROM order_items oi WHERE oi.shipment_id = $1 AND oi.id = ANY($2::uuid[]) FOR UPDATE OF oi`,
    [input.shipmentId, input.lines.map((l) => l.order_item_id)])).rows;
  const byId = new Map(items.map((i: any) => [i.id, i]));

  let taxable = 0, cgst = 0, sgst = 0, igst = 0;
  const computed = input.lines.map((l) => {
    const it: any = byId.get(l.order_item_id);
    if (!it) throw new AppError('Line is not on this shipment', 400);
    if (it.credited + l.quantity > it.quantity) throw new AppError('Credit quantity exceeds what is left on the invoice line', 400);
    // Cumulative rounding: credits for a line add up to exactly the invoiced amount
    const upTo = (v: number, q: number) => Math.round((Number(v) * q) / it.quantity);
    const share = (v: number) => upTo(v, it.credited + l.quantity) - upTo(v, it.credited);
    const lineGst = share(it.gst_amount_paise);
    const lineTaxable = share(it.line_total_paise) - lineGst;
    const c = share(it.cgst_paise), s = share(it.sgst_paise), i = share(it.igst_paise);
    taxable += lineTaxable; cgst += c; sgst += s; igst += i;
    return { ...l, taxable: lineTaxable, gst: c + s + i };
  });

  const sellerPrefix = String(shipment.invoice_number).split('/')[0];
  // Series key unchanged since Sprint 5 so the counter continues without a gap
  const number = (await client.query(`SELECT next_invoice_number($1, $2) AS n`, [`CN:${sellerPrefix}-CN`, `${sellerPrefix}C`])).rows[0].n;
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
  // Credit note against an e-invoiced invoice is registered too (C-31)
  await ensureCreditNoteEinvoice(client, cn.id, shipment.id, number);
  return { id: cn.id, credit_note_number: number, taxable_paise: taxable, gst_paise: gst,
    total_paise: taxable + gst, partner_id: shipment.partner_id };
}

// Credit notes for every open line of a shipment (cancellation). Sprint 44: a shipment
// cancelled before its invoice was issued (before the pharmacist's approval) needs none.
export async function creditWholeShipment(client: PoolClient, shipmentId: string, reason: string, userId: string | null) {
  const invoiced = (await client.query(`SELECT invoice_number FROM order_shipments WHERE id = $1`, [shipmentId])).rows[0]?.invoice_number;
  if (!invoiced) return null;
  const lines = (await client.query(
    `SELECT oi.id AS order_item_id,
            oi.quantity - COALESCE((SELECT SUM(ci.quantity) FROM credit_note_items ci WHERE ci.order_item_id = oi.id), 0)::int AS quantity
     FROM order_items oi WHERE oi.shipment_id = $1`, [shipmentId])).rows
    // Sprint 43: lines already credited by an order change (or earlier note) are not credited twice
    .filter((l: any) => Number(l.quantity) > 0);
  if (!lines.length) return null;
  return issueCreditNote(client, { shipmentId, reason, lines, userId });
}
