import { computeSettlement } from './settlementMath';

describe('computeSettlement', () => {
  it('deducts commission, fee, GST on fees, TCS and TDS from the gross', () => {
    const r = computeSettlement({
      taxablePaise: 100000, gstCollectedPaise: 12000, shipments: 2,
      commissionPct: 8, findingFeePaise: 1500, feeGstPct: 18, tcsPct: 0.5, tdsPct: 0.1,
    });
    expect(r.grossPaise).toBe(112000);
    expect(r.commissionPaise).toBe(8000);      // 8% of 1,00,000
    expect(r.findingFeePaise).toBe(3000);      // ₹15 × 2 shipments
    expect(r.feeGstPaise).toBe(1980);          // 18% of 11,000
    expect(r.tcsPaise).toBe(500);              // 0.5% of taxable
    expect(r.tdsPaise).toBe(100);              // 0.1% of taxable
    expect(r.netPayablePaise).toBe(112000 - 8000 - 3000 - 1980 - 500 - 100);
  });

  it('is zero-safe', () => {
    const r = computeSettlement({ taxablePaise: 0, gstCollectedPaise: 0, shipments: 0,
      commissionPct: 8, findingFeePaise: 1500, feeGstPct: 18, tcsPct: 0.5, tdsPct: 0.1 });
    expect(r.netPayablePaise).toBe(0);
  });
});
