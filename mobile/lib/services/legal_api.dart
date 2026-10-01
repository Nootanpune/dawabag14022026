import '../models/legal_info.dart';
import '../models/policy.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Statutory disclosures (C-04) and published policies (C-39). Public
/// endpoints; nothing is cached.
extension LegalApi on ApiService {
  /// GET /legal/info
  Future<LegalInfo> getLegalInfo() async {
    final res = await dio.get('/legal/info');
    return LegalInfo.fromJson(apiData(res));
  }

  /// GET /legal/policies → the current version of each published policy.
  Future<List<PolicyRef>> getPolicies() async {
    final res = await dio.get('/legal/policies');
    return PolicyRef.listFrom(apiData(res)['policies']);
  }

  /// GET /legal/policies/:key?lang=en|mr|hi → { title, body, version, effective_from,
  /// language, translation_available }; 404 when the policy has not been published yet.
  /// The server falls back to English when the translation is missing (C-40).
  Future<PolicyDocument> getPolicy(String key, {String lang = 'en'}) async {
    final res = await dio.get(
      '/legal/policies/${Uri.encodeComponent(key)}',
      queryParameters: lang == 'en' ? null : {'lang': lang},
    );
    return PolicyDocument.fromJson(key, apiData(res));
  }
}
