import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// ── Reference data (see registration API contract) ────────────────────────────

class CustomerTypeOption {
  final String value;
  final String label;
  final String description;
  final String kycNote;
  final IconData icon;

  const CustomerTypeOption({
    required this.value,
    required this.label,
    required this.description,
    required this.kycNote,
    required this.icon,
  });
}

const List<CustomerTypeOption> kCustomerTypes = [
  CustomerTypeOption(
    value: 'customer',
    label: 'Patient / Individual (B2C)',
    description: 'Order medicines for yourself and your family at offer prices.',
    kycNote: 'No verification needed — start shopping right after OTP',
    icon: Icons.person_outline,
  ),
  CustomerTypeOption(
    value: 'b2b_retailer',
    label: 'Retail Pharmacy / Hospital Pharmacy',
    description: 'Buy stock at PTR (price to retailer).',
    kycNote: 'KYC review: 1–2 working days',
    icon: Icons.local_pharmacy_outlined,
  ),
  CustomerTypeOption(
    value: 'b2b_wholesaler',
    label: 'Wholesaler / Distributor / Stockist',
    description: 'Buy stock at PTS (price to stockist).',
    kycNote: 'KYC review: 2–3 working days',
    icon: Icons.local_shipping_outlined,
  ),
  CustomerTypeOption(
    value: 'doc_hospital',
    label: 'Doctor / Hospital / Clinic (medical council reg.)',
    description: 'For your own patients: a registered doctor, or a hospital, clinic or nursing home through its responsible doctor.',
    kycNote: 'KYC review: 1–2 working days',
    icon: Icons.medical_services_outlined,
  ),
];

const Map<String, String> kRetailerDlTypes = {
  'dl20': 'Form 20 (DL-20)',
  'dl21': 'Form 21 (DL-21)',
};

const Map<String, String> kWholesalerDlTypes = {
  'dl20b': 'Form 20B (DL-20B)',
  'dl21b': 'Form 21B (DL-21B)',
};

const List<String> kSpecialities = [
  'General Physician',
  'Diabetologist',
  'Cardiologist',
  'Paediatrician',
  'Gynaecologist',
  'Dermatologist',
  'Orthopaedic',
  'ENT',
  'Other',
];

const Map<String, String> kDocumentLabels = {
  'drug_license': 'Drug licence',
  'pan_card': 'PAN card',
  'gst_certificate': 'GST registration certificate',
  'cancelled_cheque': 'Cancelled cheque',
  'nmc_certificate': 'NMC / State Medical Council registration certificate',
  'clinic_address_proof': 'Clinic address proof',
};

String docLabel(String type) => kDocumentLabels[type] ?? type;

const List<String> kAllowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
const int kMaxFileBytes = 5 * 1024 * 1024;
const String kPrivacyNoticeUrl = 'https://dawabag.in/privacy';

final RegExp kMobileRe = RegExp(r'^[6-9]\d{9}$');
final RegExp kPanRe = RegExp(r'^[A-Z]{5}[0-9]{4}[A-Z]$');
final RegExp kGstinRe = RegExp(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$');
final RegExp kPincodeRe = RegExp(r'^[1-9][0-9]{5}$');
final RegExp kEmailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

enum RegisterStep { type, details, documents, otp, submitted }

enum UploadStatus { pending, uploading, done, failed }

const Map<RegisterStep, String> kStepLabels = {
  RegisterStep.type: 'Type',
  RegisterStep.details: 'Details',
  RegisterStep.documents: 'Documents',
  RegisterStep.otp: 'Verify',
};

class UpperCaseFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      newValue.copyWith(text: newValue.text.toUpperCase());
}
