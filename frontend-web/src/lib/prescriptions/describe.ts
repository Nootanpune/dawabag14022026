// How a prescription is named to the buyer: when it was uploaded and in what form, so two
// uploads on the same day can be told apart.
import { formatDateTimeIST } from '../dates';
import type { MyPrescription } from './api';

export function prescriptionTitle(rx: MyPrescription): string {
  if (rx.is_digital || rx.file_type === 'eprescription') return rx.doctor_name ? `E-prescription from Dr ${rx.doctor_name}` : 'Dawabag e-prescription';
  if (rx.doctor_name) return `Prescription from Dr ${rx.doctor_name}`;
  return rx.file_type === 'pdf' ? 'Prescription (PDF)' : 'Prescription photo';
}

export const prescriptionUploaded = (rx: Pick<MyPrescription, 'created_at'>) => `Uploaded ${formatDateTimeIST(rx.created_at)}`;

export const isImage = (rx: MyPrescription) => rx.file_type === 'jpg' || rx.file_type === 'png';

/** The short kind for "Prescription (photo) uploaded …": photo, PDF, from Dr X, e-prescription. */
export function prescriptionKind(rx: MyPrescription): string {
  if (rx.is_digital || rx.file_type === 'eprescription') return 'e-prescription';
  if (rx.doctor_name) return `from Dr ${rx.doctor_name}`;
  return rx.file_type === 'pdf' ? 'PDF' : 'photo';
}
