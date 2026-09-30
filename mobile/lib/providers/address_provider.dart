import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../services/api_service.dart';
import 'auth_provider.dart';

/// GET /users/me/addresses (default address first). Empty for guests.
final addressesProvider = FutureProvider<List<Map<String, dynamic>>>((ref) async {
  final isAuthenticated = ref.watch(authProvider.select((s) => s.isAuthenticated));
  if (!isAuthenticated) return const [];
  final res = await apiService.dio.get('/users/me/addresses');
  final body = res.data;
  final list = body is Map ? body['data'] : null;
  if (list is! List) return const [];
  return list
      .whereType<Map>()
      .map((e) => Map<String, dynamic>.from(e))
      .toList();
});

/// Pincode of the signed-in user's default address (null for guests or when
/// no address is saved). Guests type a pincode per visit, kept in memory.
final defaultPincodeProvider = Provider<String?>((ref) {
  final addresses = ref.watch(addressesProvider).valueOrNull;
  if (addresses == null || addresses.isEmpty) return null;
  final preferred = addresses.firstWhere(
    (a) => a['is_default'] == true,
    orElse: () => addresses.first,
  );
  final pin = preferred['pincode']?.toString();
  return (pin == null || pin.isEmpty) ? null : pin;
});
