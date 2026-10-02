import 'json_utils.dart';

/// A business or doctor account's drug licences from GET /users/me/licences
/// (Sprint 30; C-11 buyer KYC, C-14 a lapsed licence pauses trade orders).
/// Rebuilt from every response; nothing is kept on the device.
class DrugLicence {
  final String? id;
  final String form;
  final String label; // "Form 20", "Form 21B", or the typed name of another form
  final String number;
  final String? validUpto; // YYYY-MM-DD
  final String status; // pending | verified | rejected | superseded
  final String validity; // valid | expiring | expired | no_date
  final String? rejectionReason;
  final String? issuedBy;

  const DrugLicence({
    required this.id,
    required this.form,
    required this.label,
    required this.number,
    required this.validUpto,
    required this.status,
    required this.validity,
    this.rejectionReason,
    this.issuedBy,
  });

  factory DrugLicence.fromJson(Map<String, dynamic> j) => DrugLicence(
        id: asString(j['id']),
        form: asString(j['form']) ?? 'other',
        label: asString(j['label']) ?? asString(j['form']) ?? 'Drug licence',
        number: asString(j['licence_number']) ?? '',
        validUpto: asString(j['valid_upto']),
        status: asString(j['status']) ?? 'pending',
        validity: asString(j['validity']) ?? 'no_date',
        rejectionReason: asString(j['rejection_reason']),
        issuedBy: asString(j['issued_by']),
      );

  /// Plain words for the status chip.
  String get statusText {
    if (status == 'pending') return 'Waiting for Dawabag’s check';
    if (status == 'rejected') return 'Not accepted';
    if (status == 'superseded') return 'Replaced';
    switch (validity) {
      case 'expired':
        return 'Expired';
      case 'expiring':
        return 'Renew soon';
      case 'no_date':
        return 'Valid-till not entered';
      default:
        return 'Valid';
    }
  }

  bool get needsAttention => status == 'rejected' || validity == 'expired' || validity == 'expiring';
}

class DrugLicenceSummary {
  final List<DrugLicence> licences;
  final bool canTrade;
  final List<String> problems;
  final List<String> warnings;

  const DrugLicenceSummary({
    this.licences = const [],
    this.canTrade = true,
    this.problems = const [],
    this.warnings = const [],
  });

  factory DrugLicenceSummary.fromJson(Map<String, dynamic> j) => DrugLicenceSummary(
        licences: asMapList(j['licences']).map(DrugLicence.fromJson).toList(),
        canTrade: j['can_trade'] != false,
        problems: (j['problems'] is List) ? (j['problems'] as List).map((e) => e.toString()).toList() : const [],
        warnings: (j['warnings'] is List) ? (j['warnings'] as List).map((e) => e.toString()).toList() : const [],
      );
}

/// Account types that keep drug licences (retailer, wholesaler, doctor / hospital).
const kLicenceAccountTypes = {'b2b_retailer', 'b2b_wholesaler', 'doc_hospital'};
