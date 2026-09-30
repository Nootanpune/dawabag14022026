import 'json_utils.dart';

/// Statutory disclosures from GET /api/v1/legal/info (C-04: entity, drug
/// licences, pharmacist-in-charge and grievance officer shown to buyers).
class LegalInfo {
  final Map<String, dynamic> entity;
  final Map<String, dynamic> drugLicences;
  final Map<String, dynamic> pharmacist;
  final Map<String, dynamic> grievanceOfficer;
  final int? acknowledgeWithinHours;
  final int? resolveWithinDays;

  const LegalInfo({
    this.entity = const {},
    this.drugLicences = const {},
    this.pharmacist = const {},
    this.grievanceOfficer = const {},
    this.acknowledgeWithinHours,
    this.resolveWithinDays,
  });

  factory LegalInfo.fromJson(Map<String, dynamic> json) {
    final policy = asMap(json['grievance_policy']);
    final ack = policy['acknowledge_within_hours'];
    final resolve = policy['resolve_within_days'];
    return LegalInfo(
      entity: asMap(json['entity']),
      drugLicences: asMap(json['drug_licences']),
      pharmacist: asMap(json['pharmacist_in_charge']),
      grievanceOfficer: asMap(json['grievance_officer']),
      acknowledgeWithinHours: ack == null ? null : asInt(ack),
      resolveWithinDays: resolve == null ? null : asInt(resolve),
    );
  }
}

/// Non-empty string value from a disclosure map, or null.
String? legalValue(Map<String, dynamic> map, String key) {
  final v = map[key];
  if (v == null) return null;
  final s = v.toString().trim();
  return s.isEmpty ? null : s;
}
