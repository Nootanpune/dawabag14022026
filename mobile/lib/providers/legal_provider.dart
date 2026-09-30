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

/// GET /legal/policies/:key (public, C-39).
final policyProvider = FutureProvider.autoDispose.family<PolicyDocument, String>((ref, key) {
  return apiService.getPolicy(key);
});
