import 'api_service.dart';
import 'api_utils.dart';

/// Changing an order before our pharmacist approves it and the tax invoice is
/// issued (Sprint 44, owner decision 2026-10-03; backend services/orderEdit).
/// The server re-prices the order, allocates more stock and settles the money
/// (refund, credit bill, or a second payment for the difference, C-37); the
/// app only sends what the buyer chose and reloads the order.
extension OrderEditApi on ApiService {
  /// POST /orders/:id/edit {lines:[{order_item_id, quantity}], add:[{product_id,
  /// quantity}], prescription_id?, written_order_id?} — 0 removes a line, more
  /// raises it. → {id, lines, refund_paise, refund_status, extra_paise,
  /// extra_status, extra_payment {order_edit_id, amount_paise, capture} | null,
  /// order_status, sent_to_pharmacist, prescription, written_order, message}.
  /// Refusals carry a message ready for the buyer, e.g. 409 ORDER_NOT_EDITABLE,
  /// 400 ORDER_EDIT_ALREADY_ON_ORDER, 422 PRESCRIPTION_REQUIRED (C-08),
  /// 422 WRITTEN_ORDER_* / 409 WRITTEN_ORDER_USED (r.65(9)(b)), CREDIT_LIMIT_EXCEEDED.
  Future<Map<String, dynamic>> editOrder(
    String orderId, {
    List<Map<String, dynamic>> lines = const [],
    List<Map<String, dynamic>> add = const [],
    String? prescriptionId,
    String? writtenOrderId,
  }) async {
    final res = await dio.post('/orders/${Uri.encodeComponent(orderId)}/edit', data: {
      'lines': lines,
      'add': add,
      if (prescriptionId != null) 'prescription_id': prescriptionId,
      if (writtenOrderId != null) 'written_order_id': writtenOrderId,
    });
    return apiData(res);
  }
}
