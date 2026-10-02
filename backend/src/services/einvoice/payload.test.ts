import { buildIrpPayload, irpDate } from './payload';
import { InvoiceData } from '../invoiceData.service';

const party = { gstin: '27AAACD1234M1Z5', legalName: 'Dawabag Private Limited', address1: 'Plot 1, MIDC', location: 'Nashik', pincode: '422007', stateCode: '27' };
const doc: InvoiceData = {
  invoiceNumber: 'DWB/2627/00012', invoiceDate: new Date('2026-09-30T20:00:00Z'), orderNumber: 'DB1',
  seller: { name: 'x', address: 'x', state: 'Maharashtra', gstin: party.gstin, drugLicence: null, drugLicences: [] },
  buyer: { name: 'y', address: 'y', state: 'Karnataka', gstin: '29AAACR5555K1Z2', pan: null, drugLicence: null, drugLicences: [], unregistered: false },
  interState: true, einvoice: null,
  lines: [{ name: 'Paracetamol 500', hsn: '3004.90.99', batch: 'B1', expiry: '2028-03', manufacturer: null, qty: 3,
    mrpPaise: 3000, ratePaise: 2500, taxablePaise: 7500, gstRate: 12, cgstPaise: 0, sgstPaise: 0, igstPaise: 900, totalPaise: 8400 }],
  totals: { taxablePaise: 7500, cgstPaise: 0, sgstPaise: 0, igstPaise: 900, totalPaise: 8400 },
};

describe('e-invoice payload', () => {
  it('dates are Indian dd/mm/yyyy', () => expect(irpDate('2026-09-30T20:00:00Z')).toBe('01/10/2026'));
  it('builds a B2B invoice in rupees with matching totals', () => {
    const p: any = buildIrpPayload(doc, { seller: party, buyer: { ...party, gstin: '29AAACR5555K1Z2', stateCode: '29' }, placeOfSupply: '29' });
    expect(p.DocDtls).toEqual({ Typ: 'INV', No: 'DWB/2627/00012', Dt: '01/10/2026' });
    expect(p.ItemList[0]).toMatchObject({ HsnCd: '30049099', Qty: 3, UnitPrice: 25, AssAmt: 75, IgstAmt: 9, TotItemVal: 84 });
    expect(p.ValDtls).toMatchObject({ AssVal: 75, IgstVal: 9, TotInvVal: 84 });
    expect(p.BuyerDtls.Pos).toBe('29');
    expect(p.RefDtls).toBeUndefined();
  });
  it('a credit note refers to its invoice', () => {
    const p: any = buildIrpPayload({ ...doc, title: 'CREDIT NOTE', againstInvoice: 'DWB/2627/00012', invoiceNumber: 'DWBC/2627/00001' },
      { seller: party, buyer: party, placeOfSupply: '27', originalInvoiceDate: new Date('2026-09-30T20:00:00Z') });
    expect(p.DocDtls.Typ).toBe('CRN');
    expect(p.RefDtls.PrecDocDtls[0]).toEqual({ InvNo: 'DWB/2627/00012', InvDt: '01/10/2026' });
  });
});
