import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_service.dart';

/// GET /orders/my — the buyer's latest orders (status, pharmacist_check,
/// item_count of lines still to be supplied, total). Never stored.
final ordersProvider = FutureProvider<List<dynamic>>((ref) async {
  final res = await apiService.dio.get('/orders/my?limit=20');
  return res.data['data']['orders'] as List;
});
