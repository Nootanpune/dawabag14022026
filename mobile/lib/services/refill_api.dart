import '../models/refill.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Refill subscriptions + payment mandates (Sprint 3 contract, section D).
/// Nothing is cached on the device; callers reload the list after each call.
extension RefillApi on ApiService {
  /// GET /refills
  Future<List<Refill>> getRefills() async {
    final res = await dio.get('/refills');
    return Refill.listFrom(apiData(res));
  }

  /// POST /refills { order_id, frequency_days (7–180) } → { id, next_refill_date }
  Future<Map<String, dynamic>> createRefill(String orderId, int frequencyDays) async {
    final res = await dio.post('/refills', data: {
      'order_id': orderId,
      'frequency_days': frequencyDays,
    });
    return apiData(res);
  }

  /// PATCH /refills/:id — only the given fields are sent. Pass
  /// [clearMandate] to send `mandate_id: null` (automatic payment off).
  /// Items use absolute quantities; 0 removes the item.
  Future<List<Refill>> updateRefill(
    String id, {
    int? frequencyDays,
    bool? isActive,
    String? mandateId,
    bool clearMandate = false,
    List<RefillItem>? items,
  }) async {
    final res = await dio.patch('/refills/$id', data: {
      if (frequencyDays != null) 'frequency_days': frequencyDays,
      if (isActive != null) 'is_active': isActive,
      if (mandateId != null) 'mandate_id': mandateId,
      if (mandateId == null && clearMandate) 'mandate_id': null,
      if (items != null)
        'items': items.map((i) => {'product_id': i.productId, 'quantity': i.quantity}).toList(),
    });
    return Refill.listFrom(apiData(res));
  }

  /// DELETE /refills/:id (cancels the subscription)
  Future<void> cancelRefill(String id) async {
    await dio.delete('/refills/$id');
  }

  /// GET /refills/mandates/list
  Future<List<PaymentMandate>> getMandates() async {
    final res = await dio.get('/refills/mandates/list');
    return PaymentMandate.listFrom(apiData(res));
  }

  /// POST /refills/mandates { max_amount_paise, method }. A 503 means online
  /// payments are not configured on the server.
  Future<MandateStart> startMandate(int maxAmountPaise, {String method = 'upi'}) async {
    final res = await dio.post('/refills/mandates', data: {
      'max_amount_paise': maxAmountPaise,
      'method': method,
    });
    return MandateStart.fromJson(apiData(res));
  }

  /// DELETE /refills/mandates/:id
  Future<void> cancelMandate(String id) async {
    await dio.delete('/refills/mandates/$id');
  }
}
