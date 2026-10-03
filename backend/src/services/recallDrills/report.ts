// The drill report as a PDF, generated on demand from the database record (Sprint 40,
// C-28). Never stored: neither on the API's disk nor in the object store — the drill
// record in the database is the report's single source.
import PDFDocument from 'pdfkit';
import { formatDateTimeIST } from '../../utils/ist';

const line = (doc: PDFKit.PDFDocument, label: string, value: string) =>
  doc.font('Helvetica-Bold').text(`${label}: `, { continued: true }).font('Helvetica').text(value);

export function renderDrillPdf(d: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const s = d.summary ?? {};
    const f = d.findings ?? { lines: [], h1_entries: [], stock: [], suppliers: [] };
    doc.font('Helvetica-Bold').fontSize(15).text(`Mock recall drill ${d.drill_no}`, { align: 'center' });
    doc.font('Helvetica').fontSize(9).text('Trace only — no buyer, partner or regulator was contacted (Rulebook C-28)', { align: 'center' }).moveDown();
    doc.fontSize(10);
    line(doc, 'Product', `${d.product_name} (${d.sku})`);
    line(doc, 'Batch', d.batch_number);
    line(doc, 'Scenario', d.scenario);
    line(doc, 'Started', `${formatDateTimeIST(d.started_at)} by ${d.started_by_name ?? 'admin'}`);
    line(doc, 'Traced', `${formatDateTimeIST(d.traced_at)} — time to trace ${(Number(d.time_to_trace_ms) / 1000).toFixed(2)} s`);
    doc.moveDown(0.5).font('Helvetica-Bold').text('Summary').font('Helvetica');
    doc.text(`Orders ${s.orders ?? 0} · buyers ${s.buyers ?? 0} · units supplied ${s.units_supplied ?? 0} · awaiting dispatch ${s.units_awaiting_dispatch ?? 0}`);
    doc.text(`Lines sold by Dawabag ${s.sold_by_dawabag ?? 0} · by partners ${s.sold_by_partners ?? 0} · partners involved ${s.partners_involved ?? 0}`);
    doc.text(`Schedule H1 register entries ${s.h1_entries ?? 0} · stock on hand ${s.stock_on_hand ?? 0} unit(s) at ${s.stock_locations ?? 0} location(s)`);
    doc.moveDown(0.5).font('Helvetica-Bold').text('Orders and shipments').font('Helvetica').fontSize(8.5);
    if (!f.lines.length) doc.text('None.');
    for (const l of f.lines) {
      doc.text(`${l.order_number} · ${l.buyer_name ?? 'buyer'} (${l.buyer_type ?? '—'}, ${l.buyer_city ?? ''} ${l.buyer_pincode ?? ''}) · qty ${l.quantity} · `
        + `${l.seller_type === 'partner' ? `partner ${l.partner_name ?? ''}` : 'Dawabag'} · ${l.shipment_status ?? 'not shipped'}`
        + `${l.dispatched_at ? ` · dispatched ${formatDateTimeIST(l.dispatched_at)}` : ''}${l.awb_number ? ` · AWB ${l.awb_number}` : ''}`);
    }
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Schedule H1 register entries').font('Helvetica').fontSize(8.5);
    if (!f.h1_entries.length) doc.text('None.');
    for (const h of f.h1_entries) doc.text(`${h.register_key} #${h.entry_no ?? '—'} · ${formatDateTimeIST(h.dispensed_at)} · qty ${h.quantity} · patient ${h.patient_name} · prescriber ${h.prescriber_name}`);
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Stock on hand by location').font('Helvetica').fontSize(8.5);
    if (!f.stock.length) doc.text('None.');
    for (const x of f.stock) doc.text(`${x.holder_name} · ${x.location} · available ${x.qty_available} (reserved ${x.qty_reserved}) · expiry ${x.expiry_date}${x.is_recalled ? ' · RECALLED' : ''}${x.gdp_status !== 'ok' ? ` · GDP ${x.gdp_status}` : ''}`);
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Where the batch came from').font('Helvetica').fontSize(8.5);
    if (!f.suppliers?.length) doc.text('No supplier record.');
    for (const x of f.suppliers ?? []) doc.text(`${x.holder === 'dawabag' ? `Dawabag ${x.reference}` : `Partner ${x.reference}`} · supplier ${x.supplier_name ?? '—'} · invoice ${x.supplier_invoice_no ?? '—'} ${x.supplier_invoice_date ?? ''}`);
    doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).text('Close-out').font('Helvetica');
    if (d.closed_at) {
      doc.text(`Closed ${formatDateTimeIST(d.closed_at)} by ${d.closed_by_name ?? 'admin'}`);
      doc.text(`Conclusion: ${d.conclusion}`);
      if (d.actions) doc.text(`Actions: ${d.actions}`);
    } else doc.text('Open — conclusion not yet recorded.');
    doc.end();
  });
}
