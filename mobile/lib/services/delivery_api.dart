import 'api_service.dart';
import 'api_utils.dart';

/// Public delivery information. Nothing is cached on the device.
extension DeliveryApi on ApiService {
  /// GET /delivery/offer → the free-delivery amount in paise (setting
  /// delivery.free_above_paise), or null when the owner has switched it off.
  Future<int?> getFreeDeliveryAbovePaise() async {
    final res = await dio.get('/delivery/offer');
    return parseFreeDeliveryAbove(apiData(res));
  }
}

/// Reads `free_delivery_above_paise` from the response body; anything that is not
/// a non-negative number means "off".
int? parseFreeDeliveryAbove(dynamic data) {
  final v = data is Map ? data['free_delivery_above_paise'] : null;
  return v is num && v >= 0 ? v.toInt() : null;
}
