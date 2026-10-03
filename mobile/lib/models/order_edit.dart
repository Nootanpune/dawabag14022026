import 'json_utils.dart';

// Order lines after changes and the changes themselves (Sprint 43, URS-074).
// Read from GET /orders/:id on every load; nothing is kept on the device.

/// What will actually be supplied on a line: `supply_qty` (quantity less
/// what the buyer took off before packing); older servers send only `quantity`.
int supplyQty(Map<String, dynamic> item) =>
    item['supply_qty'] == null ? asInt(item['quantity']) : asInt(item['supply_qty']);

/// Units the buyer took off this line before packing (credit note issued).
int removedQty(Map<String, dynamic> item) => asInt(item['removed_qty']);

/// "Qty: 2", with " (was 3)" or " (removed by you)" after a change — as on the website.
String orderLineQtyText(Map<String, dynamic> item) => 'Qty: ${supplyQty(item)}${orderLineChangeNote(item)}';

/// " (was N)" / " (removed by you)" when the buyer changed the line, else ''.
String orderLineChangeNote(Map<String, dynamic> item) {
  if (removedQty(item) <= 0) return '';
  return supplyQty(item) == 0 ? ' (removed by you)' : ' (was ${asInt(item['quantity'])})';
}

/// How the money for a change is handled (backend services/orderEdit/rules.ts).
class EditRefundStatus {
  EditRefundStatus._();
  static const none = 'none';
  static const recorded = 'recorded';
  static const afterCapture = 'after_capture';
  static const notNeeded = 'not_needed';
}

/// Website wording (OrderEditsCard): what happens to the money for a change.
const Map<String, String> kEditRefundWords = {
  EditRefundStatus.recorded: 'refunded the way you paid',
  EditRefundStatus.afterCapture: 'refunded as soon as the held payment is taken',
  EditRefundStatus.notNeeded: 'not charged',
  EditRefundStatus.none: '',
};

class OrderEditLine {
  final String orderItemId;
  final String productName;
  final int fromQty;
  final int toQty;
  const OrderEditLine({required this.orderItemId, required this.productName, required this.fromQty, required this.toQty});

  factory OrderEditLine.fromJson(Map<String, dynamic> j) => OrderEditLine(
        orderItemId: asString(j['order_item_id']) ?? '',
        productName: asString(j['product_name']) ?? '',
        fromQty: asInt(j['from_qty']),
        toQty: asInt(j['to_qty']),
      );

  /// "Paracetamol: removed" / "Paracetamol: 3 → 1"
  String get text => '$productName: ${toQty == 0 ? 'removed' : '$fromQty → $toQty'}';
}

/// One change the buyer made before packing (GET /orders/:id `edits[]`).
class OrderEdit {
  final String id;
  final String? editedAt;
  final List<OrderEditLine> lines;
  final int refundPaise;
  final String refundStatus;
  const OrderEdit({required this.id, this.editedAt, this.lines = const [], this.refundPaise = 0, this.refundStatus = 'none'});

  factory OrderEdit.fromJson(Map<String, dynamic> j) => OrderEdit(
        id: asString(j['id']) ?? '',
        editedAt: asString(j['edited_at']),
        lines: asMapList(j['lines']).map(OrderEditLine.fromJson).toList(),
        refundPaise: asInt(j['refund_paise']),
        refundStatus: asString(j['refund_status']) ?? EditRefundStatus.none,
      );

  static List<OrderEdit> listFrom(Object? raw) => asMapList(raw).map(OrderEdit.fromJson).toList();

  /// The words after the amount ("refunded the way you paid"), or '' when none apply.
  String get refundWords => kEditRefundWords[refundStatus] ?? '';
}

/// The lines the buyer can still lower: those with something left to supply.
List<Map<String, dynamic>> editableLines(Map<String, dynamic> order) =>
    asMapList(order['items']).where((i) => supplyQty(i) > 0).toList();

/// Body lines for POST /orders/:id/edit: only lines whose quantity changed
/// (0 removes the line). [chosen] maps order item id → new quantity.
List<Map<String, dynamic>> editRequestLines(List<Map<String, dynamic>> lines, Map<String, int> chosen) => [
      for (final l in lines)
        if (chosen[asString(l['id'])] != null && chosen[asString(l['id'])] != supplyQty(l))
          {'order_item_id': asString(l['id']), 'quantity': chosen[asString(l['id'])]},
    ];
