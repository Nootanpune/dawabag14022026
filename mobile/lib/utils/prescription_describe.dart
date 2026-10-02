import 'ist.dart';

// How a prescription is named to the buyer: when it was uploaded and in what
// form, so two uploads on the same day can be told apart. Mirrors
// frontend-web/src/lib/prescriptions/describe.ts.

bool _digital(Map<String, dynamic> rx) => rx['is_digital'] == true || rx['file_type'] == 'eprescription';

/// "Prescription photo", "Prescription (PDF)", "Prescription from Dr X", "E-prescription from Dr X".
String prescriptionTitle(Map<String, dynamic> rx) {
  final doctor = rx['doctor_name']?.toString();
  if (_digital(rx)) return doctor != null ? 'E-prescription from Dr $doctor' : 'Dawabag e-prescription';
  if (doctor != null) return 'Prescription from Dr $doctor';
  return rx['file_type'] == 'pdf' ? 'Prescription (PDF)' : 'Prescription photo';
}

/// "Uploaded 02 Oct 2026, 9:56 am" (India time).
String prescriptionUploaded(Map<String, dynamic> rx) => 'Uploaded ${formatDateTimeIst(rx['created_at'])}';

/// The short kind for "Prescription (photo) uploaded …": photo, PDF, from Dr X, e-prescription.
String prescriptionKind(Map<String, dynamic> rx) {
  final doctor = rx['doctor_name']?.toString();
  if (_digital(rx)) return 'e-prescription';
  if (doctor != null) return 'from Dr $doctor';
  return rx['file_type'] == 'pdf' ? 'PDF' : 'photo';
}

/// A photo the app can show as a small picture (signed link from the server).
bool isImagePrescription(Map<String, dynamic> rx) => rx['file_type'] == 'jpg' || rx['file_type'] == 'png';
