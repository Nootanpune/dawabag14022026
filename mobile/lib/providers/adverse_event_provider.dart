import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/adverse_event.dart';
import '../services/api_service.dart';
import '../services/compliance_api.dart';
import 'auth_provider.dart';

/// GET /compliance/adverse-events — the buyer's side-effect reports (C-29).
final adverseEventsProvider = FutureProvider.autoDispose<List<AdverseEventReport>>((ref) {
  final signedIn = ref.watch(authProvider.select((s) => s.isAuthenticated));
  if (!signedIn) return Future.value(const <AdverseEventReport>[]);
  return apiService.getAdverseEvents();
});
