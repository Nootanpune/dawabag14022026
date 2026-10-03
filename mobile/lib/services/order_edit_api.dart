import 'api_service.dart';
import 'api_utils.dart';

/// Changing an order before packing (Sprint 43, URS-074). The server issues
/// the credit note (C-30, C-31) and the refund (C-37); the app only sends the
/// new quantities and reloads the order.
extension OrderEditApi on ApiService {
  /// POST /orders/:id/edit { lines: [{ order_item_id, quantity }] } (0 removes
  /// the line) → { id, lines, credit_notes, refund_paise, refund_status, message }.
  /// Refusals carry a message ready for the buyer: 422 ORDER_EDIT_INCREASE_NOT_SUPPORTED,
  /// 409 ORDER_NOT_EDITABLE / ORDER_EDIT_WOULD_EMPTY, 400 ORDER_EDIT_BELOW_MINIMUM /
  /// ORDER_EDIT_NO_CHANGE / ORDER_EDIT_UNKNOWN_LINE / ORDER_EDIT_DUPLICATE.
  Future<Map<String, dynamic>> editOrder(String orderId, List<Map<String, dynamic>> lines) async {
    final res = await dio.post('/orders/$orderId/edit', data: {'lines': lines});
    return apiData(res);
  }
}
