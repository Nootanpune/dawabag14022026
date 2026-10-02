import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/trade_prices.dart';
import '../services/api_service.dart';
import '../services/trade_price_api.dart';
import 'auth_provider.dart';

/// Sprint 34: whether the signed-in trade buyer's prices are paused by a lapsed
/// drug licence. Asked only for retailers and wholesalers; autoDispose so each
/// screen asks the server again (nothing is kept on the phone). null = no banner.
final tradePricesProvider = FutureProvider.autoDispose<TradePrices?>((ref) async {
  final signedIn = ref.watch(authProvider.select((s) => s.isAuthenticated));
  final type = ref.watch(authProvider.select((s) => s.customerType));
  if (!signedIn || !isTradeBuyer(type)) return null;
  return apiService.getTradePrices();
});
