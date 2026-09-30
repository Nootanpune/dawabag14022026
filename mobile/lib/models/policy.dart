import 'json_utils.dart';

/// Published policies from /api/v1/legal/policies (C-39). The server holds
/// every version; the app only shows the current one and keeps no copy.

/// Keys accepted by GET /legal/policies/:key, with fallback titles.
const Map<String, String> kPolicyTitles = {
  'terms': 'Terms of use',
  'privacy': 'Privacy policy',
  'shipping': 'Shipping policy',
  'cancellation': 'Cancellation policy',
  'refund': 'Refund and return policy',
};

String policyTitle(String key, [String? serverTitle]) {
  final t = serverTitle?.trim() ?? '';
  if (t.isNotEmpty) return t;
  return kPolicyTitles[key] ?? key;
}

/// A policy in a list (GET /legal/policies or the checkout summary).
class PolicyRef {
  final String key;
  final int? version;
  final String title;
  final String? effectiveFrom;

  const PolicyRef({required this.key, this.version, required this.title, this.effectiveFrom});

  factory PolicyRef.fromJson(Map<String, dynamic> json) {
    final key = asString(json['doc_key']) ?? '';
    return PolicyRef(
      key: key,
      version: json['version'] == null ? null : asInt(json['version']),
      title: policyTitle(key, asString(json['title'])),
      effectiveFrom: asString(json['effective_from']),
    );
  }

  static List<PolicyRef> listFrom(Object? raw) =>
      asMapList(raw).map(PolicyRef.fromJson).where((p) => p.key.isNotEmpty).toList();
}

/// GET /legal/policies/:key → { title, body, version, effective_from }.
class PolicyDocument {
  final String key;
  final String title;
  final String body;
  final int? version;
  final String? effectiveFrom;

  const PolicyDocument({
    required this.key,
    required this.title,
    required this.body,
    this.version,
    this.effectiveFrom,
  });

  factory PolicyDocument.fromJson(String key, Map<String, dynamic> json) => PolicyDocument(
        key: key,
        title: policyTitle(key, asString(json['title'])),
        body: asString(json['body']) ?? '',
        version: json['version'] == null ? null : asInt(json['version']),
        effectiveFrom: asString(json['effective_from']),
      );
}
