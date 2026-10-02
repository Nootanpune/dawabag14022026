// Sprint 32 — a lapsed drug licence pauses trade prices live (C-14)
jest.mock('./register.service', () => ({ listLicences: jest.fn() }));
jest.mock('../../utils/ist', () => ({ ...jest.requireActual('../../utils/ist'), todayIST: () => '2026-10-02' }));
import { listLicences } from './register.service';
import { licensedTradeParty, livePricingType, tradePause } from './tradePrices';

const today = '2026-10-02';
const l = (form: string, licence_number: string, valid_upto: string | null, status = 'verified') => ({ form, licence_number, valid_upto, status });

describe('tradePause', () => {
  it('is null while every checked licence is in date (the last day counts)', () => {
    expect(tradePause([l('dl20', 'MH-1', '2027-01-01'), l('dl21', 'MH-2', today)], 'retailer', today)).toBeNull();
  });
  it('names the earliest lapsed checked licence — lapsed today means yesterday was the last day', () => {
    const p = tradePause([l('dl20', 'MH-1', '2027-01-01'), l('dl21', 'MH-2', '2026-10-01'), l('dl20b', 'X', '2026-09-01', 'superseded')], 'retailer', today);
    expect(p).toEqual({ form: 'dl21', label: 'Form 21', licence_number: 'MH-2', expired_on: '2026-10-01' });
  });
  it('ignores waiting renewals until they are checked', () => {
    const p = tradePause([l('dl20b', 'W-1', '2026-09-30'), l('dl20b', 'W-2', '2027-09-30', 'pending')], 'wholesaler', today);
    expect(p?.licence_number).toBe('W-1');
  });
});

describe('licensedTradeParty', () => {
  it('retailers and wholesalers only (doctors / hospitals need no licence)', () => {
    expect(licensedTradeParty('b2b_retailer')).toBe('retailer');
    expect(licensedTradeParty('b2b_wholesaler')).toBe('wholesaler');
    expect(licensedTradeParty('doc_hospital')).toBeNull();
    expect(licensedTradeParty('customer')).toBeNull();
  });
});

describe('livePricingType', () => {
  const mock = listLicences as jest.Mock;
  beforeEach(() => mock.mockReset());
  it('keeps trade prices while the licences are in date', async () => {
    mock.mockResolvedValue([l('dl20', 'MH-1', '2027-01-01')]);
    expect(await livePricingType({ id: 'u', customer_type: 'b2b_retailer', kyc_status: 'approved' }))
      .toEqual({ pricing_type: 'b2b_retailer', trade_paused: null });
  });
  it('switches to retail prices the day a licence lapses, before the nightly job', async () => {
    mock.mockResolvedValue([l('dl20b', 'W-9', '2026-10-01')]);
    const r = await livePricingType({ id: 'u', customer_type: 'b2b_wholesaler', kyc_status: 'approved' });
    expect(r.pricing_type).toBe('customer');
    expect(r.trade_paused).toMatchObject({ label: 'Form 20B', licence_number: 'W-9', expired_on: '2026-10-01' });
  });
  it('keeps saying why after the nightly job moved the account to pending_renewal', async () => {
    mock.mockResolvedValue([l('dl20', 'MH-1', '2026-09-01')]);
    const r = await livePricingType({ id: 'u', customer_type: 'b2b_retailer', kyc_status: 'pending_renewal' });
    expect(r.pricing_type).toBe('customer');
    expect(r.trade_paused?.licence_number).toBe('MH-1');
  });
  it('does not read licences for consumers, doctors or accounts awaiting KYC', async () => {
    expect((await livePricingType({ id: 'u', customer_type: 'customer', kyc_status: 'not_required' })).pricing_type).toBe('customer');
    expect((await livePricingType({ id: 'u', customer_type: 'doc_hospital', kyc_status: 'approved' })).pricing_type).toBe('doc_hospital');
    expect((await livePricingType({ id: 'u', customer_type: 'b2b_retailer', kyc_status: 'pending_kyc' })).pricing_type).toBe('customer');
    expect(mock).not.toHaveBeenCalled();
  });
});
