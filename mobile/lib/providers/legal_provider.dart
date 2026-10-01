import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/legal_info.dart';
import '../models/policy.dart';
import '../services/api_service.dart';
import '../services/legal_api.dart';

/// GET /legal/info (public, C-04). Fetched each time the screen opens.
final legalInfoProvider = FutureProvider.autoDispose<LegalInfo>((ref) {
  return apiService.getLegalInfo();
});

/// GET /legal/policies (public, C-39). Fetched each time it is shown.
final policiesProvider = FutureProvider.autoDispose<List<PolicyRef>>((ref) {
  return apiService.getPolicies();
});

/// GET /legal/policies/:key?lang= (public, C-39, C-40). Argument: (policy key, language code).
final policyInLanguageProvider =
    FutureProvider.autoDispose.family<PolicyDocument, (String, String)>((ref, arg) {
  return apiService.getPolicy(arg.$1, lang: arg.$2);
});
