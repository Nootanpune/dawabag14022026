// Plain-English status of a buyer's prescription (statuses from the server:
// pending / verified / rejected / expired). A pharmacist checks every prescription
// before medicines are dispensed (C-08).
import type { MyPrescription } from './api';

export type StatusTone = 'waiting' | 'ok' | 'bad' | 'muted';

export interface RxStatus {
  label: string;
  hint: string;
  tone: StatusTone;
}

export function prescriptionStatus(rx: MyPrescription): RxStatus {
  switch (rx.status) {
    case 'verified':
      return { label: 'Checked by our pharmacist', hint: 'You can choose it again at checkout while it is valid.', tone: 'ok' };
    case 'rejected':
      return { label: 'Not accepted', hint: rx.rejection_reason || 'Please upload a clear, complete and current prescription.', tone: 'bad' };
    case 'expired':
      return { label: 'Expired', hint: 'Please upload a new prescription from your doctor.', tone: 'muted' };
    default:
      return rx.order_id
        ? { label: 'Waiting for our pharmacist', hint: `Our pharmacist checks it with ${rx.order_number ? `order ${rx.order_number}` : 'your order'} before dispatch.`, tone: 'waiting' }
        : { label: 'Uploaded — not checked yet', hint: 'Choose it at checkout. Our pharmacist checks it with your order before dispatch.', tone: 'waiting' };
  }
}
