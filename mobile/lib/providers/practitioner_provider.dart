import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/practitioner.dart';
import '../services/api_service.dart';
import '../services/practitioner_api.dart';

/// GET /practitioner-sales/me (Sprint 44, r.65(9)(b)) — refetched whenever a
/// screen invalidates it (e.g. after a refusal); never stored.
final practitionerRegistrationProvider =
    FutureProvider.autoDispose<PractitionerRegistration>((ref) => apiService.getMyRegistration());

/// GET /written-orders/mine — signed in the last 30 days and not yet used.
final myWrittenOrdersProvider = FutureProvider.autoDispose<List<WrittenOrder>>((ref) => apiService.getMyWrittenOrders());
