import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_service.dart';
import '../services/prescription_api.dart';

/// The buyer's prescriptions from the server (GET /prescriptions/my); dropped
/// when no screen shows them — nothing is kept on the device.
final myPrescriptionsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>(
  (_) => apiService.getMyPrescriptions(),
);
