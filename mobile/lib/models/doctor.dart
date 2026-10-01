import 'json_utils.dart';

/// A verified teleconsultation doctor from GET /doctors and GET /doctors/:id.
/// Qualification, council and registration number are always shown to the
/// patient (Telemedicine Practice Guidelines 2020; C-22).
class Doctor {
  final String id;
  final String fullName;
  final String qualification;
  final String? speciality;
  final String? clinicName;
  final String council;
  final String regNumber;
  final int? registrationYear;
  final int feePaise;
  final String? bio;
  final List<String> languages;

  const Doctor({
    required this.id,
    required this.fullName,
    required this.qualification,
    this.speciality,
    this.clinicName,
    required this.council,
    required this.regNumber,
    this.registrationYear,
    required this.feePaise,
    this.bio,
    this.languages = const [],
  });

  /// "Reg. no. 12345 · Maharashtra Medical Council · 2012"
  String get registrationLine => [
        'Reg. no. $regNumber',
        if (council.isNotEmpty) council,
        if (registrationYear != null) '$registrationYear',
      ].join(' · ');

  factory Doctor.fromJson(Map<String, dynamic> json) {
    final year = json['registration_year'];
    final langs = json['languages_spoken'];
    return Doctor(
      id: asString(json['id']) ?? '',
      fullName: asString(json['full_name']) ?? '',
      qualification: asString(json['qualification']) ?? '',
      speciality: asString(json['speciality']),
      clinicName: asString(json['clinic_name']),
      council: asString(json['council']) ?? '',
      regNumber: asString(json['nmc_reg_number']) ?? '',
      registrationYear: year == null ? null : asInt(year),
      feePaise: asInt(json['consultation_fee_paise']),
      bio: asString(json['bio']),
      languages: langs is List
          ? langs.map((l) => l?.toString() ?? '').where((l) => l.isNotEmpty).toList()
          : const [],
    );
  }
}

/// An open slot from GET /doctors/:id/slots?date=YYYY-MM-DD.
/// `slot_start` / `slot_end` are 'HH:MM:SS' (India time, set by the doctor).
class DoctorSlot {
  final String id;
  final String? slotDate;
  final String slotStart;
  final String slotEnd;

  const DoctorSlot({
    required this.id,
    this.slotDate,
    required this.slotStart,
    required this.slotEnd,
  });

  factory DoctorSlot.fromJson(Map<String, dynamic> json) => DoctorSlot(
        id: asString(json['id']) ?? '',
        slotDate: asString(json['slot_date']),
        slotStart: asString(json['slot_start']) ?? '',
        slotEnd: asString(json['slot_end']) ?? '',
      );
}
