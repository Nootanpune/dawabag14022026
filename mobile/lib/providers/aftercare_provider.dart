import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/aftercare.dart';
import '../services/aftercare_api.dart';
import '../services/api_service.dart';
import 'auth_provider.dart';

/// Returns and refunds (C-37), fetched from the server each time a screen
/// opens (autoDispose) and on pull-to-refresh. Nothing is kept on the device.

/// GET /returns
final returnsProvider = FutureProvider.autoDispose<List<ReturnRequest>>((ref) {
  final signedIn = ref.watch(authProvider.select((s) => s.isAuthenticated));
  if (!signedIn) return Future.value(const <ReturnRequest>[]);
  return apiService.getReturns();
});

/// GET /returns/:id
final returnDetailProvider = FutureProvider.autoDispose.family<ReturnRequest, String>((ref, id) {
  return apiService.getReturn(id);
});

/// GET /returns/refunds/my
final myRefundsProvider = FutureProvider.autoDispose<List<Refund>>((ref) {
  final signedIn = ref.watch(authProvider.select((s) => s.isAuthenticated));
  if (!signedIn) return Future.value(const <Refund>[]);
  return apiService.getMyRefunds();
});
