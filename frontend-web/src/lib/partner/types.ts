import type { LicenceView } from '../licences/forms';
// Shapes returned by the partner portal API (/partner/*). Money is integer paise.

export interface PartnerMe {
  id: string;
  name: string;
  /** Sprint 36: this login is the partner's owner (manages stock-feed API keys) */
  is_owner?: boolean;
  gst_number: string | null;
  drug_license_no: string | null;
  drug_license_type: string | null;
  drug_license_expiry: string | null;
  approval_status: string;
  vendor_type: string;
  invoice_prefix: string | null;
  pincode: string | null;
  city: string | null;
  vendor_rating: number | string | null;
  commission_pct: number | string | null;
  finding_fee_paise: number | null;
  /** every drug licence (Sprint 30) */
  licences?: LicenceView[];
  licence_line?: string | null;
}

export interface CatalogueProduct {
  id: string;
  name: string;
  generic_name: string | null;
  sku: string;
  drug_schedule: string | null;
  mrp_paise: number;
  offer_price_paise: number | null;
  ptr_price_paise: number | null;
  pts_price_paise: number | null;
  institutional_price_paise: number | null;
  cold_chain: boolean;
  already_listed: boolean;
}

export interface NewListing {
  product_id: string;
  partner_sku?: string;
  catalogue_price_accepted: true;
  h1_pharmacist_name?: string;
  h1_pharmacist_reg_no?: string;
  h1_secure_storage_declared?: boolean;
}

export interface PartnerListing {
  id: string;
  product_id: string;
  medicine_name: string;
  partner_sku: string | null;
  drug_schedule: string | null;
  mrp_paise: number;
  cold_chain: boolean;
  approval_status: string;
  listing_status: string;
  rejection_reason_code: string | null;
  rejection_details: string | null;
  submission_date: string | null;
  posted_at: string | null;
  qty_available: number | null;
  qty_reserved: number | null;
  earliest_expiry: string | null;
}

export interface BatchInput {
  batch_number: string;
  qty_available: number;
  expiry_date: string;
  manufactured_date?: string;
  cold_chain_confirmed?: boolean;
  /** Sprint 39: who supplied the batch (optional; recorded once, never changed — C-02) */
  supplier_name?: string;
  supplier_licence_no?: string;
  supplier_invoice_no?: string;
  supplier_invoice_date?: string;
}

export interface SavedBatch {
  batch_number: string;
  qty_available: number;
  qty_reserved: number;
  expiry_date: string;
  cold_chain_confirmed: boolean;
  supplier_name?: string | null;
  supplier_licence_no?: string | null;
  supplier_invoice_no?: string | null;
  supplier_invoice_date?: string | null;
}

export type ShipmentStatus = 'pending' | 'dispatched' | 'delivered' | 'cancelled';

export interface ShipmentLine {
  product_name: string;
  sku: string;
  quantity: number;
  unit_price_paise: number;
  gst_rate: number | string;
  batch_number: string | null;
  expiry_date: string | null;
}

export interface PartnerShipment {
  id: string;
  invoice_number: string | null;
  status: ShipmentStatus;
  subtotal_paise: number;
  gst_paise: number;
  total_paise: number;
  cold_chain: boolean;
  courier_partner: string | null;
  awb_number: string | null;
  /** sent by newer servers; absent means the server decides (C-26) */
  seal_number?: string | null;
  handover_code_required?: boolean;
  dispatched_at: string | null;
  delivered_at: string | null;
  created_at: string;
  order_number: string;
  order_status: string;
  ship_to_name: string | null;
  ship_to_mobile: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  lines: ShipmentLine[];
  /** Sprint 35: your registered pharmacist checks and releases it before packing (C-08) */
  pharmacist_check?: 'pending' | 'held' | 'released' | 'rejected' | 'not_recorded';
  pharmacist_check_note?: string | null;
  pharmacist_name?: string | null;
  pharmacist_reg_no?: string | null;
  pharmacist_checked_at?: string | null;
}

/** One of the partner's registered pharmacists (Sprint 28, recorded by Dawabag's admin) */
export interface PartnerPharmacist {
  id: string; full_name: string; registration_no: string;
  /** Sprint 39 (C-03): an unverified, lapsed, expired or suspended registration cannot release shipments */
  valid_till?: string | null;
  registration?: { ok: boolean; state: string; message: string | null };
}

/** Drug schedule helpers — the server enforces the same rules. */
// DB values are 'Schedule H1' etc.; the old check compared against 'H1' and never matched.
export { isScheduleH1 } from '../drugSchedule';
