// ─── Customer types ──────────────────────────────────────────────────────────
export type CustomerType = 'customer' | 'b2b_retailer' | 'b2b_wholesaler' | 'doc_hospital';

export type KycStatus =
  | 'not_required'
  | 'pending_otp'
  | 'pending_kyc'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'pending_renewal'
  | 'flagged_gstin';

export interface CustomerTypeOption {
  value: CustomerType;
  label: string;
  description: string;
  pricing: string;
  kycNote: string;
}

export const CUSTOMER_TYPE_OPTIONS: CustomerTypeOption[] = [
  {
    value: 'customer',
    label: 'Patient / Individual (B2C)',
    description: 'Order medicines for yourself or your family.',
    pricing: 'Offer price',
    kycNote: 'No KYC — account active right after OTP',
  },
  {
    value: 'b2b_retailer',
    label: 'Retail Pharmacy / Hospital Pharmacy',
    description: 'Buy stock for your chemist shop or hospital pharmacy.',
    pricing: 'PTR pricing',
    kycNote: 'KYC review: 1–2 working days',
  },
  {
    value: 'b2b_wholesaler',
    label: 'Wholesaler / Distributor / Stockist',
    description: 'Bulk trade purchases for distribution.',
    pricing: 'PTS pricing',
    kycNote: 'KYC review: 2–3 working days',
  },
  {
    value: 'doc_hospital',
    label: 'Doctor (NMC / State Medical Council reg.)',
    description: 'Individual doctors with NMC or State Medical Council registration. Clinics and hospitals register as a Retail Pharmacy.',
    pricing: 'Institutional pricing',
    kycNote: 'KYC review: 1–2 working days',
  },
];

export function getCustomerTypeOption(type: CustomerType): CustomerTypeOption {
  return CUSTOMER_TYPE_OPTIONS.find((o) => o.value === type)!;
}

// ─── KYC documents ───────────────────────────────────────────────────────────
export type DocumentType =
  | 'drug_license'
  | 'pan_card'
  | 'gst_certificate'
  | 'cancelled_cheque'
  | 'nmc_certificate'
  | 'clinic_address_proof';

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  drug_license: 'Drug license',
  pan_card: 'PAN card',
  gst_certificate: 'GST registration certificate',
  cancelled_cheque: 'Cancelled cheque',
  nmc_certificate: 'NMC / State Medical Council registration certificate',
  clinic_address_proof: 'Clinic address proof',
};

/** Required documents per the contract (gst_certificate for retailers only when a GSTIN was given). */
export function getRequiredDocuments(type: CustomerType, hasGstin: boolean): DocumentType[] {
  switch (type) {
    case 'b2b_retailer':
      return hasGstin ? ['drug_license', 'pan_card', 'gst_certificate'] : ['drug_license', 'pan_card'];
    case 'b2b_wholesaler':
      return ['drug_license', 'gst_certificate', 'pan_card', 'cancelled_cheque'];
    case 'doc_hospital':
      return ['nmc_certificate', 'pan_card'];
    default:
      return [];
  }
}

export function getOptionalDocuments(type: CustomerType): DocumentType[] {
  return type === 'doc_hospital' ? ['clinic_address_proof'] : [];
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const ACCEPT_ATTR = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

/** Returns an error message, or null if the file is acceptable. */
export function validateKycFile(file: File): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeOk = ACCEPTED_FILE_TYPES.includes(file.type) || ['pdf', 'jpg', 'jpeg', 'png'].includes(ext);
  if (!typeOk) return 'Only PDF, JPG or PNG files are allowed';
  if (file.size > MAX_FILE_BYTES) return 'File must be 5 MB or smaller';
  if (file.size === 0) return 'File is empty';
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Step-2 form rules and the register payload live in ./registrationForm.
export * from './registrationForm';

// ─── API response shapes ─────────────────────────────────────────────────────
export interface RegisterResponseData {
  mobile: string;
  otp_sent: boolean;
  customer_type: CustomerType;
  kyc_required: boolean;
  required_documents: DocumentType[];
}

export interface KycUploadResponseData {
  document_type: DocumentType;
  uploaded: boolean;
  kyc_status: KycStatus;
  missing_documents: DocumentType[];
}
