import 'json_utils.dart';

/// Consent records from GET /api/v1/privacy/consents (C-40..C-44). The server
/// keeps an append-only log; `current` is the latest row per purpose.
class ConsentRecord {
  final String purpose;
  final bool granted;
  final String? policyVersion;
  final String? recordedAt;

  const ConsentRecord({
    required this.purpose,
    required this.granted,
    this.policyVersion,
    this.recordedAt,
  });

  factory ConsentRecord.fromJson(Map<String, dynamic> json) => ConsentRecord(
        purpose: asString(json['purpose']) ?? '',
        granted: asBool(json['granted']),
        policyVersion: asString(json['policy_version']),
        recordedAt: asString(json['recorded_at']),
      );
}

class PrivacyConsents {
  final List<ConsentRecord> current;
  final List<ConsentRecord> history;
  final String? policyVersion;

  const PrivacyConsents({
    this.current = const [],
    this.history = const [],
    this.policyVersion,
  });

  ConsentRecord? currentFor(String purpose) {
    for (final c in current) {
      if (c.purpose == purpose) return c;
    }
    return null;
  }

  /// Marketing is opt-in: off unless the latest record grants it (C-40 / C-42).
  bool get marketingGranted => currentFor('marketing')?.granted ?? false;

  factory PrivacyConsents.fromJson(Map<String, dynamic> json) => PrivacyConsents(
        current: asMapList(json['current']).map(ConsentRecord.fromJson).toList(),
        history: asMapList(json['history']).map(ConsentRecord.fromJson).toList(),
        policyVersion: asString(json['policy_version']),
      );
}

/// Human label for a consent purpose code.
String consentPurposeLabel(String purpose) {
  switch (purpose) {
    case 'marketing':
      return 'Offers and marketing messages';
    case 'privacy_notice':
      return 'Privacy notice accepted';
    case 'age_18_plus':
      return 'Confirmed 18 years or older';
    default:
      final s = purpose.replaceAll('_', ' ');
      return s.isEmpty ? purpose : s[0].toUpperCase() + s.substring(1);
  }
}

/// A correction / erasure request from GET /privacy/requests (C-40..C-44).
class DataRequest {
  final String requestType;
  final String status;
  final String? outcome;
  final String? createdAt;

  const DataRequest({required this.requestType, required this.status, this.outcome, this.createdAt});

  factory DataRequest.fromJson(Map<String, dynamic> json) => DataRequest(
        requestType: asString(json['request_type']) ?? '',
        status: asString(json['status']) ?? 'pending',
        outcome: asString(json['outcome']),
        createdAt: asString(json['created_at']),
      );

  static List<DataRequest> listFrom(Map<String, dynamic> data) =>
      asMapList(data['requests']).map(DataRequest.fromJson).toList();

  String get typeLabel => switch (requestType) {
        'erasure' => 'Delete my data',
        'correction' => 'Correct my data',
        _ => requestType.replaceAll('_', ' '),
      };

  String get statusLabel => status.isEmpty
      ? status
      : status[0].toUpperCase() + status.substring(1).replaceAll('_', ' ');
}
