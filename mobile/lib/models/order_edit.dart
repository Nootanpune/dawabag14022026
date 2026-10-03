import 'json_utils.dart';

// Order lines after changes and the changes themselves (Sprint 43, URS-074;
// Sprint 44: changes before the pharmacist's approval — lower, remove, raise
// and add — owner decision 2026-10-03). Read from GET /orders/:id on every
// load; nothing is kept on the device.

/// What will actually be supplied on a line: `supply_qty` (quantity less
/// what the buyer took off); older servers send only `quantity`.
int supplyQty(Map<String, dynamic> item) =>
    item['supply_qty'] == null ? asInt(item['quantity']) : asInt(item['supply_qty']);

/// Units the buyer took off this line (Sprint 43: after the invoice, with a credit note).
int removedQty(Map<String, dynamic> item) => asInt(item['removed_qty']);

/// "Qty: 2", with " (was 3)" or " (removed by you)" after a change — as on the website.
String orderLineQtyText(Map<String, dynamic> item) => 'Qty: ${supplyQty(item)}${orderLineChangeNote(item)}';

/// " (was N)" / " (removed by you)" when the buyer changed the line, else ''.
String orderLineChangeNote(Map<String, dynamic> item) {
  if (removedQty(item) <= 0) return '';
  return supplyQty(item) == 0 ? ' (removed by you)' : ' (was ${asInt(item['quantity'])})';
}

/// How the money for a change that lowered the order is handled
/// (backend services/orderEdit/rules.ts EditRefundStatus).
class EditRefundStatus {
  EditRefundStatus._();
  static const none = 'none';
  static const recorded = 'recorded';
  static const afterCapture = 'after_capture';
  static const notNeeded = 'not_needed';
  /// Sprint 44: a credit-terms buyer's bill was lowered
  static const creditBill = 'credit_bill';
}

/// Website wording (OrderEditsCard): what happens to the money for a change.
const Map<String, String> kEditRefundWords = {
  EditRefundStatus.recorded: 'refunded the way you paid',
  EditRefundStatus.afterCapture: 'refunded as soon as the held payment is taken',
  EditRefundStatus.notNeeded: 'not charged',
  EditRefundStatus.creditBill: 'taken off your credit bill',
  EditRefundStatus.none: '',
};

/// The second payment for a change that raised the order (Sprint 44, `extra_status`).
class ExtraStatus {
  ExtraStatus._();
  static const none = 'none';
  static const awaitingPayment = 'awaiting_payment';
  static const authorised = 'authorised';
  static const paid = 'paid';
  static const onCreditBill = 'on_credit_bill';
  static const superseded = 'superseded';
  static const cancelled = 'cancelled';
}

/// Website wording (OrderEditsCard EXTRA_WORDS): the state of the difference.
const Map<String, String> kExtraWords = {
  ExtraStatus.awaitingPayment: 'to pay',
  ExtraStatus.authorised: 'held until the pharmacist’s check',
  ExtraStatus.paid: 'paid',
  ExtraStatus.onCreditBill: 'added to your credit bill',
  ExtraStatus.superseded: 'replaced by a later change',
  ExtraStatus.cancelled: 'not charged (order cancelled)',
};

class OrderEditLine {
  /// Null for a medicine added by the change (Sprint 44, kind 'added').
  final String? orderItemId;
  final String productName;
  final int fromQty;
  final int toQty;
  /// lowered | removed | raised | added (older changes send none)
  final String? kind;
  const OrderEditLine({this.orderItemId, required this.productName, required this.fromQty, required this.toQty, this.kind});

  factory OrderEditLine.fromJson(Map<String, dynamic> j) => OrderEditLine(
        orderItemId: asString(j['order_item_id']),
        productName: asString(j['product_name']) ?? '',
        fromQty: asInt(j['from_qty']),
        toQty: asInt(j['to_qty']),
        kind: asString(j['kind']),
      );

  bool get added => kind == 'added';

  /// "Paracetamol: removed" / "Paracetamol: 3 → 1" / "Cetirizine: added (2)"
  String get text => '$productName: ${added ? 'added ($toQty)' : toQty == 0 ? 'removed' : '$fromQty → $toQty'}';
}

/// One change the buyer made (GET /orders/:id `edits[]`): Sprint 43 after the
/// invoice with a credit note, Sprint 44 before it (`stage` 'before_invoice').
class OrderEdit {
  final String id;
  final String? editedAt;
  final String? stage;
  final List<OrderEditLine> lines;
  final int refundPaise;
  final String refundStatus;
  final int extraPaise;
  final String extraStatus;
  final bool sentToPharmacist;
  const OrderEdit({
    required this.id,
    this.editedAt,
    this.stage,
    this.lines = const [],
    this.refundPaise = 0,
    this.refundStatus = EditRefundStatus.none,
    this.extraPaise = 0,
    this.extraStatus = ExtraStatus.none,
    this.sentToPharmacist = false,
  });

  factory OrderEdit.fromJson(Map<String, dynamic> j) => OrderEdit(
        id: asString(j['id']) ?? '',
        editedAt: asString(j['edited_at']),
        stage: asString(j['stage']),
        lines: asMapList(j['lines']).map(OrderEditLine.fromJson).toList(),
        refundPaise: asInt(j['refund_paise']),
        refundStatus: asString(j['refund_status']) ?? EditRefundStatus.none,
        extraPaise: asInt(j['extra_paise']),
        extraStatus: asString(j['extra_status']) ?? ExtraStatus.none,
        sentToPharmacist: asBool(j['sent_to_pharmacist']),
      );

  static List<OrderEdit> listFrom(Object? raw) => asMapList(raw).map(OrderEdit.fromJson).toList();

  /// The words after the amount ("refunded the way you paid"), or '' when none apply.
  String get refundWords => kEditRefundWords[refundStatus] ?? '';

  /// "to pay", "paid", … for the difference, or the raw status for a new one.
  String get extraWords => kExtraWords[extraStatus] ?? extraStatus.replaceAll('_', ' ');
}

/// The difference still to pay for a change (GET /orders/:id `extra_payment`,
/// Sprint 44), or null. Paid with POST /payments/create-order {order_id, order_edit_id}.
class ExtraPaymentDue {
  final String orderEditId;
  final int amountPaise;
  final String status;
  const ExtraPaymentDue({required this.orderEditId, required this.amountPaise, this.status = ExtraStatus.awaitingPayment});

  static ExtraPaymentDue? fromOrder(Map<String, dynamic> order) {
    final raw = order['extra_payment'];
    if (raw is! Map) return null;
    final j = Map<String, dynamic>.from(raw);
    final id = asString(j['order_edit_id']) ?? '';
    final status = asString(j['status']) ?? ExtraStatus.awaitingPayment;
    if (id.isEmpty || status != ExtraStatus.awaitingPayment || asInt(j['amount_paise']) <= 0) return null;
    return ExtraPaymentDue(orderEditId: id, amountPaise: asInt(j['amount_paise']), status: status);
  }
}

/// The lines the buyer can still change: those with something left to supply.
List<Map<String, dynamic>> editableLines(Map<String, dynamic> order) =>
    asMapList(order['items']).where((i) => supplyQty(i) > 0).toList();

/// Body lines for POST /orders/:id/edit: only lines whose quantity changed
/// (0 removes the line, more raises it). [chosen] maps order item id → new quantity.
List<Map<String, dynamic>> editRequestLines(List<Map<String, dynamic>> lines, Map<String, int> chosen) => [
      for (final l in lines)
        if (chosen[asString(l['id'])] != null && chosen[asString(l['id'])] != supplyQty(l))
          {'order_item_id': asString(l['id']), 'quantity': chosen[asString(l['id'])]},
    ];

/// Schedules that need a prescription for a retail buyer (C-08; the server decides).
const Set<String> kRxSchedules = {'Schedule H', 'Schedule H1'};

/// Buyers who buy at trade prices; they need no patient prescription (the server decides).
const Set<String> kTradePricingTypes = {'b2b_retailer', 'b2b_wholesaler', 'doc_hospital'};

/// A medicine the buyer adds to the order (Sprint 44), held in the sheet only.
class EditAddition {
  final Map<String, dynamic> product;
  final int quantity;
  const EditAddition(this.product, this.quantity);

  String get productId => asString(product['id']) ?? '';
  String get name => asString(product['name']) ?? '';
  bool get needsRx => kRxSchedules.contains(asString(product['drug_schedule']));
  int get unitPaise => asInt(product['display_price_paise'] ?? product['offer_price_paise']);
  EditAddition withQuantity(int q) => EditAddition(product, q);
  Map<String, dynamic> toJson() => {'product_id': productId, 'quantity': quantity};
}
