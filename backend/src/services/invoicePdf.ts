// src/services/invoicePdf.ts — renders InvoiceData as a PDF buffer (pdfkit)
import PDFDocument from 'pdfkit';
import { InvoiceData } from './invoiceData.service';

const rs = (p: number) => `Rs. ${(p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function renderInvoicePdf(d: InvoiceData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const isCredit = d.title === 'CREDIT NOTE';
    doc.font('Helvetica-Bold').fontSize(16).text(d.title ?? 'TAX INVOICE', { align: 'center' });
    doc.moveDown(0.3).font('Helvetica').fontSize(9)
      .text(`${isCredit ? 'Credit note' : 'Invoice'} No: ${d.invoiceNumber}    Date: ${new Date(d.invoiceDate).toLocaleDateString('en-IN')}    Order: ${d.orderNumber}`, { align: 'center' });
    if (d.againstInvoice) doc.text(`Against tax invoice: ${d.againstInvoice}`, { align: 'center' });
    if (d.irn && !isCredit) doc.text(`IRN: ${d.irn}`, { align: 'center' });
    doc.moveDown();

    const top = doc.y;
    party(doc, 36, top, 'Sold by (seller of record)', [
      d.seller.name, d.seller.address, `State: ${d.seller.state ?? '-'}`,
      `GSTIN: ${d.seller.gstin ?? '-'}`, `Drug licence: ${d.seller.drugLicence ?? '-'}`,
    ]);
    party(doc, 306, top, 'Billed / shipped to', [
      d.buyer.name, d.buyer.address, `State (place of supply): ${d.buyer.state ?? '-'}`,
      `GSTIN: ${d.buyer.unregistered ? 'Unregistered Buyer' : d.buyer.gstin}`,
      ...(d.buyer.pan ? [`PAN: ${d.buyer.pan}`] : []),
      ...(d.buyer.drugLicence ? [`Buyer drug licence: ${d.buyer.drugLicence}`] : []),
    ]);
    doc.y = top + 110;

    const cols = d.interState
      ? [['Item', 150], ['HSN', 42], ['Batch/Exp', 62], ['Qty', 26], ['MRP', 46], ['Rate', 46], ['Taxable', 52], ['IGST', 60], ['Total', 56]]
      : [['Item', 140], ['HSN', 40], ['Batch/Exp', 60], ['Qty', 24], ['MRP', 44], ['Rate', 44], ['Taxable', 50], ['CGST', 42], ['SGST', 42], ['Total', 54]];
    row(doc, cols.map(([h]) => String(h)), cols, true);
    for (const l of d.lines) {
      const tax = d.interState
        ? [`${rs(l.igstPaise)} (${l.gstRate}%)`]
        : [`${rs(l.cgstPaise)}`, `${rs(l.sgstPaise)}`];
      row(doc, [`${l.name}${l.manufacturer ? ' — ' + l.manufacturer : ''}`, l.hsn ?? '-',
        `${l.batch ?? '-'} / ${l.expiry ?? '-'}`, String(l.qty), rs(l.mrpPaise), rs(l.ratePaise), rs(l.taxablePaise),
        ...tax, rs(l.totalPaise)], cols, false);
    }
    doc.moveDown();
    const t = d.totals;
    doc.font('Helvetica-Bold').fontSize(9)
      .text(`Taxable value: ${rs(t.taxablePaise)}`, { align: 'right' })
      .text(d.interState ? `IGST: ${rs(t.igstPaise)}` : `CGST: ${rs(t.cgstPaise)}   SGST: ${rs(t.sgstPaise)}`, { align: 'right' })
      .fontSize(11).text(`${isCredit ? 'Credit note' : 'Invoice'} total: ${rs(t.totalPaise)}`, { align: 'right' });
    doc.moveDown(2).font('Helvetica').fontSize(8).fillColor('#444')
      .text('Delivery charges, discounts and wallet use appear on the order summary. Goods once dispensed cannot be returned except as per the refund policy.')
      .text('This is a computer-generated invoice.');
    doc.end();
  });
}

function party(doc: PDFKit.PDFDocument, x: number, y: number, title: string, lines: string[]) {
  doc.font('Helvetica-Bold').fontSize(9).text(title, x, y, { width: 250 });
  doc.font('Helvetica').fontSize(8.5);
  for (const l of lines) doc.text(l || ' ', x, doc.y, { width: 250 });
}

function row(doc: PDFKit.PDFDocument, cells: string[], cols: (string | number)[][], header: boolean) {
  const y = doc.y;
  let x = 36;
  doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(7.5);
  let maxY = y;
  cells.forEach((c, i) => {
    const w = Number(cols[i][1]);
    doc.text(c, x, y, { width: w - 3 });
    maxY = Math.max(maxY, doc.y);
    x += w;
  });
  doc.y = maxY + 3;
  doc.moveTo(36, doc.y - 1.5).lineTo(559, doc.y - 1.5).lineWidth(0.3).strokeColor('#bbb').stroke();
  doc.x = 36;
}
