import 'json_utils.dart';

/// One row of GET /consultations/doctor?date=YYYY-MM-DD — a verified doctor's
/// own consultations on one day, cancelled ones left out by the server
/// (Telemedicine Practice Guidelines 2020; C-22, C-23). Rebuilt from every
/// server response; nothing is kept on the device.
class DoctorConsultation {
  final String id;
  final String mode;
  final String status;
  final String? consultKind;
  final String paymentStatus;
  final String? chiefComplaint;
  final String? slotDate;
  final String? slotStart;
  final String? slotEnd;
  final String? patientName;
  final String? patientGender;
  final int? patientAge;
  final String? prescriptionId;

  const DoctorConsultation({
    required this.id,
    required this.mode,
    required this.status,
    this.consultKind,
    required this.paymentStatus,
    this.chiefComplaint,
    this.slotDate,
    this.slotStart,
    this.slotEnd,
    this.patientName,
    this.patientGender,
    this.patientAge,
    this.prescriptionId,
  });

  bool get isOpen => status == 'booked' || status == 'in_progress';

  /// Offered for every open consultation; GET /consultations/:id/join decides
  /// (402 fee unpaid, 409 more than 15 minutes early or past) and its message
  /// is shown when it refuses.
  bool get canTryJoin => isOpen;

  /// POST /consultations/:id/end accepts only a consultation in progress
  /// (the doctor's first join moves it from booked to in progress).
  bool get canEnd => status == 'in_progress';

  /// 'Female, 34'
  String get patientDetails => [
        if (patientGender != null && patientGender!.isNotEmpty)
          patientGender![0].toUpperCase() + patientGender!.substring(1),
        if (patientAge != null) '$patientAge',
      ].join(', ');

  factory DoctorConsultation.fromJson(Map<String, dynamic> json) => DoctorConsultation(
        id: asString(json['id']) ?? '',
        mode: asString(json['mode']) ?? 'video',
        status: asString(json['status']) ?? 'booked',
        consultKind: asString(json['consult_kind']),
        paymentStatus: asString(json['payment_status']) ?? 'unpaid',
        chiefComplaint: asString(json['chief_complaint']),
        slotDate: asString(json['slot_date']),
        slotStart: asString(json['slot_start']),
        slotEnd: asString(json['slot_end']),
        patientName: asString(json['patient_name']),
        patientGender: asString(json['patient_gender']),
        patientAge: json['patient_age'] == null ? null : asInt(json['patient_age']),
        prescriptionId: asString(json['prescription_id']),
      );
}
