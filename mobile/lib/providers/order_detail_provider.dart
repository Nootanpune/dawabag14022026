import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_service.dart';
import '../services/api_utils.dart';

/// GET /orders/:id — the server's order (items, shipments with seal and
/// delivery code, can_cancel, requires_prescription, credit notes, refunds,
/// returns). Refetched whenever a screen invalidates it; never stored.
final orderDetailProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final res = await apiService.dio.get('/orders/$id');
  return apiData(res);
});
