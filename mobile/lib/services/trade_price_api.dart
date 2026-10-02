import '../models/trade_prices.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Sprint 34: GET /users/me/trade-prices — the server's live decision (C-14).
extension TradePriceApi on ApiService {
  Future<TradePrices> getTradePrices() async => TradePrices.fromJson(apiData(await dio.get('/users/me/trade-prices')));
}
