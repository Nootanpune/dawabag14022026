import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_service.dart';
import '../services/delivery_api.dart';

/// GET /delivery/offer (public). Fetched each time the home screen shows it and
/// dropped when it leaves (autoDispose): the server's setting is the only copy.
final freeDeliveryAboveProvider = FutureProvider.autoDispose<int?>((ref) {
  return apiService.getFreeDeliveryAbovePaise();
});
