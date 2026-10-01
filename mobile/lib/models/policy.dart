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

/// Languages a policy can be read in (DPDP notice; C-40). Labels in their own script.
const Map<String, String> kPolicyLanguages = {
  'en': 'English',
  'mr': 'मराठी',
  'hi': 'हिंदी',
};

/// English names, for notes such as "showing English".
const Map<String, String> kPolicyLanguageNames = {
  'en': 'English',
  'mr': 'Marathi',
  'hi': 'Hindi',
};

/// A supported language code, else 'en'.
String normalizePolicyLanguage(String? lang) =>
    kPolicyLanguages.containsKey(lang) ? lang! : 'en';

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

/// GET /legal/policies/:key?lang= → { title, body, version, effective_from,
/// language, requested_language, translation_available } (C-39, C-40).
class PolicyDocument {
  final String key;
  final String title;
  final String body;
  final int? version;
  final String? effectiveFrom;

  /// Language of the text returned — English when the translation is missing.
  final String language;
  final String requestedLanguage;
  final bool translationAvailable;

  const PolicyDocument({
    required this.key,
    required this.title,
    required this.body,
    this.version,
    this.effectiveFrom,
    this.language = 'en',
    this.requestedLanguage = 'en',
    this.translationAvailable = true,
  });

  /// True when the reader asked for Marathi / Hindi and the server fell back to English.
  bool get showingEnglishFallback => !translationAvailable && requestedLanguage != 'en';

  factory PolicyDocument.fromJson(String key, Map<String, dynamic> json) {
    final language = normalizePolicyLanguage(asString(json['language']));
    return PolicyDocument(
      key: key,
      title: policyTitle(key, asString(json['title'])),
      body: asString(json['body']) ?? '',
      version: json['version'] == null ? null : asInt(json['version']),
      effectiveFrom: asString(json['effective_from']),
      language: language,
      requestedLanguage: normalizePolicyLanguage(asString(json['requested_language']) ?? language),
      translationAvailable: json['translation_available'] == null ? true : asBool(json['translation_available']),
    );
  }
}
