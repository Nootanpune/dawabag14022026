// src/utils/customerType.ts
// Buyer types from URS v3.1 and the rules that depend on them. Kept free of
// database/Express imports so the rules can be unit-tested directly.

export const BUYER_TYPES = ['customer', 'b2b_retailer', 'b2b_wholesaler', 'doc_hospital'] as const;
export type BuyerType = typeof BUYER_TYPES[number];

export const TRADE_TYPES: readonly BuyerType[] = ['b2b_retailer', 'b2b_wholesaler', 'doc_hospital'];

export function isBuyerType(value: unknown): value is BuyerType {
  return typeof value === 'string' && (BUYER_TYPES as readonly string[]).includes(value);
}

// The type whose prices and privileges apply right now. A B2B or doctor account
// is not active until admin KYC approval (URS v3.1 §2), so until then it is
// treated as B2C: retail price, prescription needed, prepaid only.
export function effectiveCustomerType(customerType: string | null | undefined, kycStatus: string | null | undefined): BuyerType {
  if (!isBuyerType(customerType) || customerType === 'customer') return 'customer';
  return kycStatus === 'approved' ? customerType : 'customer';
}

export function priceField(type: BuyerType): 'offer_price_paise' | 'ptr_price_paise' | 'pts_price_paise' | 'institutional_price_paise' {
  switch (type) {
    case 'b2b_retailer':   return 'ptr_price_paise';
    case 'b2b_wholesaler': return 'pts_price_paise';
    case 'doc_hospital':   return 'institutional_price_paise';
    default:               return 'offer_price_paise';
  }
}

// Licensed buyers (drug licence or NMC registration) are exempt from uploading
// a prescription for Schedule H/H1. Schedule X and NDPS are blocked separately.
export function requiresPrescription(type: BuyerType, drugSchedule: string | null | undefined): boolean {
  if (TRADE_TYPES.includes(type)) return false;
  return drugSchedule === 'Schedule H' || drugSchedule === 'Schedule H1';
}

// Only retailers and wholesalers get CAD / credit terms at order time.
export function allowsCreditTerms(type: BuyerType): boolean {
  return type === 'b2b_retailer' || type === 'b2b_wholesaler';
}

// ── KYC documents ─────────────────────────────────────────────────────────────
export const KYC_DOCUMENT_TYPES = [
  'drug_license', 'pan_card', 'gst_certificate', 'nmc_certificate',
  'cancelled_cheque', 'clinic_address_proof',
] as const;
export type KycDocumentType = typeof KYC_DOCUMENT_TYPES[number];

// URS v3.1 §3 document matrix. GST certificate is required for a retailer only
// when they gave a GSTIN; clinic address proof is optional for doctors.
export function requiredKycDocuments(type: BuyerType, hasGstin: boolean): KycDocumentType[] {
  switch (type) {
    case 'b2b_retailer':   return hasGstin ? ['drug_license', 'pan_card', 'gst_certificate'] : ['drug_license', 'pan_card'];
    case 'b2b_wholesaler': return ['drug_license', 'gst_certificate', 'pan_card', 'cancelled_cheque'];
    case 'doc_hospital':   return ['nmc_certificate', 'pan_card'];
    default:               return [];
  }
}
