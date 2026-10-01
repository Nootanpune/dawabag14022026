// E-invoice JSON (schema 1.1) built from the same InvoiceData the PDF prints, so
// the IRP and the paper invoice can never disagree (C-30, C-31). Pure: no I/O.
import { InvoiceData } from '../invoiceData.service';

export interface Party {
  gstin: string; legalName: string; address1: string; location: string; pincode: string; stateCode: string;
}
export interface EinvoiceParties { seller: Party; buyer: Party; placeOfSupply: string; originalInvoiceDate?: Date }

const rupees = (paise: number) => Math.round(Number(paise)) / 100;
const clip = (s: string, n: number) => (s || '').replace(/\s+/g, ' ').trim().slice(0, n);

// dd/mm/yyyy in Indian time
export function irpDate(d: Date | string): string {
  const ist = new Date(new Date(d).getTime() + 5.5 * 3600e3);
  return `${String(ist.getUTCDate()).padStart(2, '0')}/${String(ist.getUTCMonth() + 1).padStart(2, '0')}/${ist.getUTCFullYear()}`;
}

const party = (p: Party) => ({
  Gstin: p.gstin, LglNm: clip(p.legalName, 100), Addr1: clip(p.address1, 100) || 'NA',
  Loc: clip(p.location, 50).padEnd(3, '.'), Pin: Number(p.pincode), Stcd: p.stateCode,
});

export function buildIrpPayload(doc: InvoiceData, parties: EinvoiceParties) {
  const credit = doc.title === 'CREDIT NOTE';
  const items = doc.lines.map((l, i) => {
    const tax = Number(l.cgstPaise) + Number(l.sgstPaise) + Number(l.igstPaise);
    return {
      SlNo: String(i + 1),
      PrdDesc: clip(l.name, 300),
      IsServc: 'N',
      HsnCd: String(l.hsn ?? '').replace(/\D/g, ''),
      BchDtls: l.batch ? { Nm: clip(l.batch, 20), ExpDt: l.expiry ? irpDate(`${l.expiry}-01T00:00:00+05:30`) : undefined } : undefined,
      Qty: l.qty,
      Unit: 'NOS',
      UnitPrice: Math.round(Number(l.taxablePaise) / l.qty) / 100,
      TotAmt: rupees(l.taxablePaise),
      Discount: 0,
      AssAmt: rupees(l.taxablePaise),
      GstRt: l.gstRate,
      CgstAmt: rupees(l.cgstPaise), SgstAmt: rupees(l.sgstPaise), IgstAmt: rupees(l.igstPaise),
      TotItemVal: rupees(Number(l.taxablePaise) + tax),
    };
  });
  const t = doc.totals;
  return {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: 'B2B', RegRev: 'N', IgstOnIntra: 'N' },
    DocDtls: { Typ: credit ? 'CRN' : 'INV', No: doc.invoiceNumber, Dt: irpDate(doc.invoiceDate) },
    SellerDtls: party(parties.seller),
    BuyerDtls: { ...party(parties.buyer), Pos: parties.placeOfSupply },
    ItemList: items,
    ValDtls: {
      AssVal: rupees(t.taxablePaise), CgstVal: rupees(t.cgstPaise), SgstVal: rupees(t.sgstPaise), IgstVal: rupees(t.igstPaise),
      TotInvVal: rupees(Number(t.taxablePaise) + Number(t.cgstPaise) + Number(t.sgstPaise) + Number(t.igstPaise)),
    },
    ...(credit && doc.againstInvoice ? { RefDtls: { PrecDocDtls: [{ InvNo: doc.againstInvoice, InvDt: irpDate(parties.originalInvoiceDate ?? doc.invoiceDate) }] } } : {}),
  };
}
