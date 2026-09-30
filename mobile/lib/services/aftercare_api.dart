import '../models/aftercare.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Cancellation, returns and refunds (C-37). Nothing is cached on the
/// device; callers reload from the server after each call.
extension AftercareApi on ApiService {
  /// POST /orders/:id/cancel { reason (3–500) } → { id, status, refund_paise,
  /// refunds, credit_notes }. Allowed until packing starts.
  Future<Map<String, dynamic>> cancelOrder(String orderId, String reason) async {
    final res = await dio.post('/orders/$orderId/cancel', data: {'reason': reason});
    return apiData(res);
  }

  /// POST /returns { shipment_id, reason, description (10–2000),
  /// items: [{ order_item_id, quantity }] }. The server answers 409 with a
  /// message when the 48 h / 30 day reporting window has passed.
  Future<Map<String, dynamic>> createReturn({
    required String shipmentId,
    required String reason,
    required String description,
    required Map<String, int> quantities,
  }) async {
    final res = await dio.post('/returns', data: {
      'shipment_id': shipmentId,
      'reason': reason,
      'description': description,
      'items': quantities.entries
          .where((e) => e.value > 0)
          .map((e) => {'order_item_id': e.key, 'quantity': e.value})
          .toList(),
    });
    return apiData(res);
  }

  /// GET /returns
  Future<List<ReturnRequest>> getReturns() async {
    final res = await dio.get('/returns');
    return ReturnRequest.listFrom(apiData(res)['returns']);
  }

  /// GET /returns/:id (items, credit notes, refunds, decision notes)
  Future<ReturnRequest> getReturn(String id) async {
    final res = await dio.get('/returns/$id');
    return ReturnRequest.fromJson(apiData(res));
  }

  /// GET /returns/refunds/my
  Future<List<Refund>> getMyRefunds() async {
    final res = await dio.get('/returns/refunds/my');
    return Refund.listFrom(apiData(res)['refunds']);
  }
}
