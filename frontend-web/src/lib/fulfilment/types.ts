// Staff fulfilment types — shapes returned by /api/v1/fulfilment/* (Sprint 4).

export type QueueStage = 'rx' | 'pack' | 'dispatch' | 'deliver';

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
  order_id: string;
  order_number: string;
  order_status: string;
  ship_to_name: string | null;
  city: string | null;
  pincode: string | null;
  lines: QueueShipmentLine[];
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
  prescribed_on: string; // YYYY-MM-DD
  patient_name: string;
  valid_days: number;
  items: { product_id: string; prescribed_qty: number }[];
  notes?: string;
}

export interface H1Entry {
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
