// src/services/settlementMath.ts — pure settlement arithmetic (unit-tested)
// Partner is the seller of record; Dawabag collects the buyer's payment as the
// e-commerce operator and pays the partner:
//   gross (taxable + GST collected)
//   − commission (on taxable) − finding fee (per shipment)
//   − GST on commission + fee
//   − TCS (CGST s.52, on taxable) − TDS (s.194-O, on taxable)   (Rulebook C-32)
// Rates come from app_settings / partner_commission_rates; CA confirms them.

export interface SettlementInput {
  taxablePaise: number;
  gstCollectedPaise: number;
  shipments: number;
  commissionPct: number;
  findingFeePaise: number;   // per shipment
  feeGstPct: number;
  tcsPct: number;
  tdsPct: number;
}

export interface SettlementResult {
  grossPaise: number;
  commissionPaise: number;
  findingFeePaise: number;
  feeGstPaise: number;
  tcsPaise: number;
  tdsPaise: number;
  netPayablePaise: number;
}

const pct = (base: number, rate: number) => Math.round((base * rate) / 100);

export function computeSettlement(i: SettlementInput): SettlementResult {
  const grossPaise = i.taxablePaise + i.gstCollectedPaise;
  const commissionPaise = pct(i.taxablePaise, i.commissionPct);
  const findingFeePaise = i.findingFeePaise * i.shipments;
  const feeGstPaise = pct(commissionPaise + findingFeePaise, i.feeGstPct);
  const tcsPaise = pct(i.taxablePaise, i.tcsPct);
  const tdsPaise = pct(i.taxablePaise, i.tdsPct);
  return {
    grossPaise, commissionPaise, findingFeePaise, feeGstPaise, tcsPaise, tdsPaise,
    netPayablePaise: grossPaise - commissionPaise - findingFeePaise - feeGstPaise - tcsPaise - tdsPaise,
  };
}
