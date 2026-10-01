import 'json_utils.dart';

/// An e-prescription from GET /consultations/prescriptions/:id, in the
/// Telemedicine Practice Guidelines 2020 format (C-23, C-24). The patient may
/// take it to any pharmacy; ordering at Dawabag is optional.
class EPrescriptionItem {
  final String medicineName;
  final String? dosage;
  final String? frequency;
  final int? durationDays;
  final String? instructions;

  const EPrescriptionItem({
    required this.medicineName,
    this.dosage,
    this.frequency,
    this.durationDays,
    this.instructions,
  });

  factory EPrescriptionItem.fromJson(Map<String, dynamic> json) {
    final days = json['duration_days'];
    return EPrescriptionItem(
      medicineName: asString(json['medicine_name']) ?? '',
      dosage: asString(json['dosage']),
      frequency: asString(json['frequency']),
      durationDays: days == null ? null : asInt(days),
      instructions: asString(json['instructions']),
    );
  }
}

class EPrescription {
  final String? diagnosis;
  final String? advice;
  final String? issuedAt;
  final String? validUntil;
  final String? verificationCode;
  final String? consultKind;
  final String? consultMode;
  final String? doctorName;
  final String? doctorQualification;
  final String? doctorRegNo;
  final String? doctorCouncil;
  final String? patientName;
  final int? patientAge;
  final String? patientGender;
  final bool sentToDawabag;
  final List<EPrescriptionItem> items;

  const EPrescription({
    this.diagnosis,
    this.advice,
    this.issuedAt,
    this.validUntil,
    this.verificationCode,
    this.consultKind,
    this.consultMode,
    this.doctorName,
    this.doctorQualification,
    this.doctorRegNo,
    this.doctorCouncil,
    this.patientName,
    this.patientAge,
    this.patientGender,
    this.sentToDawabag = false,
    this.items = const [],
  });

  factory EPrescription.fromJson(Map<String, dynamic> json) {
    final age = json['patient_age'];
    return EPrescription(
      diagnosis: asString(json['diagnosis']),
      advice: asString(json['advice']),
      issuedAt: asString(json['issued_at']),
      validUntil: asString(json['valid_until']),
      verificationCode: asString(json['verification_code']),
      consultKind: asString(json['consult_kind']),
      consultMode: asString(json['consult_mode']),
      doctorName: asString(json['doctor_name']),
      doctorQualification: asString(json['doctor_qualification']),
      doctorRegNo: asString(json['doctor_reg_no']),
      doctorCouncil: asString(json['doctor_council']),
      patientName: asString(json['patient_name']),
      patientAge: age == null ? null : asInt(age),
      patientGender: asString(json['patient_gender']),
      sentToDawabag: asBool(json['sent_to_dawabag']),
      items: asMapList(json['items']).map(EPrescriptionItem.fromJson).toList(),
    );
  }
}
