// src/utils/rejectionCodes.ts — partner listing rejection codes
// From templates/05_Product_Review_Approval.xlsx (sheet 2), with REJ-12
// corrected to wholesale Forms 20B/21B (docs/DECISIONS.md).
export const REJECTION_CODES: Record<string, { category: string; partner_action: string }> = {
  'REJ-01': { category: 'Expiry too short', partner_action: 'Resubmit with a batch expiring at least 6 months from resubmission.' },
  'REJ-02': { category: 'Wrong HSN code', partner_action: 'Check the HSN on the carton or the CBIC HSN finder and resubmit.' },
  'REJ-03': { category: 'Drug schedule mismatch', partner_action: 'Check the product label (Rx symbol = Schedule H) and resubmit.' },
  'REJ-04': { category: 'Price issue', partner_action: 'Partners sell at the Dawabag catalogue price; accept it to list.' },
  'REJ-05': { category: 'Batch number missing', partner_action: 'Add the batch number printed on the carton or inner pack.' },
  'REJ-06': { category: 'Near-expiry stock', partner_action: 'Sell this batch through your own channel; resubmit with a longer-expiry batch.' },
  'REJ-07': { category: 'NDPS or Schedule X', partner_action: 'These products cannot be sold online. Do not resubmit.' },
  'REJ-08': { category: 'Cold chain — no storage', partner_action: 'Arrange 2–8 °C storage, share proof and resubmit.' },
  'REJ-09': { category: 'Insufficient stock', partner_action: 'Resubmit when at least 20 units or strips are available.' },
  'REJ-10': { category: 'Price verification pending', partner_action: 'No action; the Dawabag team will call you.' },
  'REJ-11': { category: 'Manufacturer not recognised', partner_action: 'Enter the exact manufacturer name from the carton; provide a batch test report if asked.' },
  'REJ-12': { category: 'Wholesale licence required', partner_action: 'Only partners holding a wholesale licence (Form 20B/21B) can supply this product.' },
  'REJ-13': { category: 'Schedule H1 extra documents', partner_action: 'Submit pharmacist qualification proof, H1 storage declaration and SOP.' },
  'REJ-14': { category: 'Duplicate — better option exists', partner_action: 'Resubmit if you can serve an uncovered pincode or offer better service.' },
};

export function rejectionLabel(code: string | null | undefined) {
  return code && REJECTION_CODES[code] ? { code, ...REJECTION_CODES[code] } : null;
}
