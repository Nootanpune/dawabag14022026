// Staff fulfilment types — shapes returned by /api/v1/fulfilment/* (Sprint 4).

export type QueueStage = 'rx' | 'check' | 'pack' | 'dispatch' | 'deliver';

/** Sprint 35: a registered pharmacist checks and releases every shipment before packing (C-08) */
export type PharmacistCheck = 'pending' | 'held' | 'released' | 'rejected' | 'not_recorded';

export interface CheckSignal { product_name: string; signal: string }

export interface CheckLine {
  order_item_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  drug_schedule: string | null;
  prescription_verified: boolean;
}

/** GET /fulfilment/queue?stage=check — Dawabag shipments waiting for the pharmacist */
export interface CheckQueueItem {
  shipment_id: string;
  invoice_number: string | null;
  total_paise: number;
  cold_chain: boolean;
  created_at: string;
  pharmacist_check: PharmacistCheck;
  pharmacist_check_note: string | null;
  pharmacist_checked_at: string | null;
  order_id: string;
  order_number: string;
  order_status: string;
  payment_terms: string | null;
  buyer_name: string | null;
  customer_type: string;
  lines: CheckLine[];
  signals: CheckSignal[];
  /** Sprint 44: the buyer still owes the difference for a change — cannot be approved yet */
  extra_payment_pending?: boolean;
  /** Sprint 44: signed written orders on a doctor / institution order (r.65(9)(b)) */
  written_orders?: number;
}

/** GET /fulfilment/checks/:orderId */
export interface OrderCheckDetail {
  order: { id: string; order_number: string; status: string; payment_terms: string | null; buyer_name: string | null; customer_type: string };
  lines: (CheckLine & { shipment_id: string })[];
  signals: CheckSignal[];
  shipments: {
    id: string; seller_type: string; seller_name: string; status: string; pharmacist_check: PharmacistCheck;
    pharmacist_check_note: string | null; pharmacist_name: string | null; pharmacist_reg_no: string | null; pharmacist_checked_at: string | null;
  }[];
}

export type CheckDecision = 'release' | 'hold' | 'reject';

export interface QueuePrescription {
  prescription_id: string;
  status: string;
  uploaded_at: string;
  file_type: string | null;
}

export interface RxQueueItem {
  order_id: string;
  order_number: string;
  status: string;
  created_at: string;
  buyer_name: string | null;
  customer_type: string;
  prescriptions: QueuePrescription[] | null;
  /** saved, verified prescription the buyer offered at checkout (C-08); pharmacist applies it */
  requested_prescription_id?: string | null;
}

export interface QueueShipmentLine {
  product_name: string;
  quantity: number;
  batch_number: string | null;
  expiry_date: string | null;
  rx_cleared: boolean;
}

export interface QueueShipment {
  shipment_id: string;
  invoice_number: string | null;
  status: string;
  total_paise: number;
  cold_chain: boolean;
  created_at: string;
  courier_partner: string | null;
  awb_number: string | null;
  /** sent by newer servers; absent means "unknown" and the server decides (C-26) */
  seal_number?: string | null;
  handover_code_required?: boolean;
  order_id: string;
  order_number: string;
  order_status: string;
  ship_to_name: string | null;
  city: string | null;
  pincode: string | null;
  lines: QueueShipmentLine[];
  /** Sprint 35: packing waits for the pharmacist's release (C-08) */
  pharmacist_check?: PharmacistCheck;
  pharmacist_check_note?: string | null;
  pharmacist_name?: string | null;
  pharmacist_reg_no?: string | null;
}

/** An order line from GET /orders/:id (staff view) */
export interface StaffOrderItem {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  drug_schedule: string | null;
  prescription_id: string | null;
}

export interface StaffOrder {
  id: string;
  order_number: string;
  status: string;
  customer_name: string | null;
  customer_type: string;
  delivery_name: string | null;
  items: StaffOrderItem[];
}

export interface VerifyRxInput {
  prescriber_name: string;
  prescriber_reg_no: string;
  /** Sprint 38: needed for the Schedule H1 register (C-09) */
  prescriber_address: string;
  prescribed_on: string; // YYYY-MM-DD
  patient_name: string;
  valid_days: number;
  items: { product_id: string; prescribed_qty: number }[];
  notes?: string;
}

export interface H1Entry {
  /** Sprint 38: one register per seller licence, numbered 1, 2, 3 … (null = before Sprint 38) */
  register_key: string | null;
  entry_no: number | null;
  seller_licence_no: string | null;
  prescriber_address: string | null;
  chain_legacy: boolean;
  dispensed_at: string;
  seller_type: string;
  partner_name: string | null;
  order_number: string;
  product_name: string;
  batch_number: string | null;
  quantity: number;
  patient_name: string | null;
  patient_address: string | null;
  prescriber_name: string | null;
  prescriber_reg_no: string | null;
  pharmacist_name: string | null;
  pharmacist_reg_no: string | null;
}

/** GET /fulfilment/riders — Dawabag's own delivery staff (Sprint 13) */
export interface Rider {
  id: string;
  full_name: string | null;
  mobile: string;
  /** parcels this rider has out right now */
  out_now: number;
}

/**
 * One stop on a rider's run sheet (GET /fulfilment/my-run, Sprint 13).
 * Only what the hand-over needs — never the medicines inside (C-41, C-26).
 */
export interface RunStop {
  shipment_id: string;
  order_number: string;
  /** the DWR… run reference */
  run_ref: string | null;
  seal_number: string | null;
  cold_chain: boolean;
  handover_code_required: boolean;
  handover_attempts: number | null;
  dispatched_at: string | null;
  deliver_to: string | null;
  contact_mobile: string | null;
  address: string;
  item_lines: number;
}
