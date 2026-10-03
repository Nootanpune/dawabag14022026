import 'json_utils.dart';

/// Returns, refunds and credit notes (C-37). Rebuilt from every API
/// response; nothing is kept on the device.

/// Reasons accepted by POST /returns. The server enforces the windows:
/// damaged / wrong / missing within 48 h of delivery, the rest within 30 days.
const Map<String, String> kReturnReasons = {
  'damaged': 'Damaged or tampered pack',
  'wrong_item': 'Wrong item delivered',
  'missing_item': 'Item missing from the pack',
  'expired': 'Expired medicine',
  'near_expiry': 'Too close to expiry',
  'quality_issue': 'Quality problem',
  'recalled': 'Batch has been recalled',
};

String returnReasonLabel(String reason) => kReturnReasons[reason] ?? reason.replaceAll('_', ' ');

/// requested → approved / rejected → closed
String returnStatusLabel(String status) {
  switch (status) {
    case 'requested':
      return 'Under review';
    case 'approved':
      return 'Approved';
    case 'rejected':
      return 'Rejected';
    case 'closed':
      return 'Closed';
    default:
      return status.replaceAll('_', ' ');
  }
}

String refundMethodLabel(String? method) {
  switch (method) {
    case 'gateway':
      return 'To original payment method';
    case 'wallet':
      return 'To Dawabag wallet';
    case 'credit_adjustment':
      return 'Adjusted against credit balance';
    case 'manual':
      return 'Bank transfer by our accounts team';
    default:
      return (method ?? 'Refund').replaceAll('_', ' ');
  }
}

/// Why a refund was made, in words (Sprint 43 QA; same as the website).
String refundSourceLabel(String? source) {
  switch (source) {
    case 'cancellation':
      return 'order cancelled';
    case 'return':
      return 'return';
    case 'admin':
      return 'from Dawabag';
    case 'order_edit':
      return 'order changed';
    default:
      return (source ?? '').replaceAll('_', ' ');
  }
}

/// Why a credit note was issued, in words (Sprint 43 QA; same as the website).
String creditNoteReasonLabel(String? reason) {
  switch (reason) {
    case 'cancellation':
      return 'order cancelled';
    case 'order_edit':
      return 'order changed before packing';
    default:
      return (reason ?? '').replaceFirst(RegExp(r'^return_'), 'return: ').replaceAll('_', ' ');
  }
}

String refundStatusLabel(String status) {
  switch (status) {
    case 'pending':
      return 'Processing';
    case 'processed':
      return 'Refunded';
    case 'failed':
      return 'Failed — we will contact you';
    default:
      return status.replaceAll('_', ' ');
  }
}

class Refund {
  final String? id;
  final String? orderId;
  final String? orderNumber;
  final String? source;
  final String? method;
  final int amountPaise;
  final String status;
  final String? createdAt;
  final String? processedAt;

  const Refund({
    this.id,
    this.orderId,
    this.orderNumber,
    this.source,
    this.method,
    this.amountPaise = 0,
    this.status = 'pending',
    this.createdAt,
    this.processedAt,
  });

  factory Refund.fromJson(Map<String, dynamic> json) => Refund(
        id: asString(json['id']),
        orderId: asString(json['order_id']),
        orderNumber: asString(json['order_number']),
        source: asString(json['source']),
        method: asString(json['method']),
        amountPaise: asInt(json['amount_paise']),
        status: asString(json['status']) ?? 'pending',
        createdAt: asString(json['created_at']),
        processedAt: asString(json['processed_at']),
      );

  static List<Refund> listFrom(Object? raw) => asMapList(raw).map(Refund.fromJson).toList();
}

class CreditNote {
  /// Present on order detail (can be opened as a PDF); absent on return detail.
  final String? id;
  final String number;
  final int totalPaise;
  final String? reason;
  final String? createdAt;

  const CreditNote({this.id, required this.number, this.totalPaise = 0, this.reason, this.createdAt});

  factory CreditNote.fromJson(Map<String, dynamic> json) => CreditNote(
        id: asString(json['id']),
        number: asString(json['credit_note_number']) ?? '',
        totalPaise: asInt(json['total_paise']),
        reason: asString(json['reason']),
        createdAt: asString(json['created_at']),
      );

  static List<CreditNote> listFrom(Object? raw) => asMapList(raw).map(CreditNote.fromJson).toList();
}

class ReturnItem {
  final String orderItemId;
  final int quantity;
  final String productName;
  final String? batchNumber;
  final String? expiryDate;

  const ReturnItem({
    required this.orderItemId,
    this.quantity = 0,
    this.productName = '',
    this.batchNumber,
    this.expiryDate,
  });

  factory ReturnItem.fromJson(Map<String, dynamic> json) => ReturnItem(
        orderItemId: asString(json['order_item_id']) ?? '',
        quantity: asInt(json['quantity']),
        productName: asString(json['product_name']) ?? '',
        batchNumber: asString(json['batch_number']),
        expiryDate: asString(json['expiry_date']),
      );
}

class ReturnRequest {
  final String id;
  final String returnNo;
  final String? orderId;
  final String? orderNumber;
  final String? shipmentId;
  final String reason;
  final String? description;
  final String status;
  final int? refundPaise;
  final String? decisionNotes;
  final String? sellerName;
  final String? createdAt;
  final String? decidedAt;

  /// Detail-only (GET /returns/:id).
  final List<ReturnItem> items;
  final List<CreditNote> creditNotes;
  final List<Refund> refunds;

  const ReturnRequest({
    required this.id,
    required this.returnNo,
    this.orderId,
    this.orderNumber,
    this.shipmentId,
    required this.reason,
    this.description,
    required this.status,
    this.refundPaise,
    this.decisionNotes,
    this.sellerName,
    this.createdAt,
    this.decidedAt,
    this.items = const [],
    this.creditNotes = const [],
    this.refunds = const [],
  });

  factory ReturnRequest.fromJson(Map<String, dynamic> json) => ReturnRequest(
        id: asString(json['id']) ?? '',
        returnNo: asString(json['return_no']) ?? '',
        orderId: asString(json['order_id']),
        orderNumber: asString(json['order_number']),
        shipmentId: asString(json['shipment_id']),
        reason: asString(json['reason']) ?? '',
        description: asString(json['description']),
        status: asString(json['status']) ?? 'requested',
        refundPaise: json['refund_paise'] == null ? null : asInt(json['refund_paise']),
        decisionNotes: asString(json['decision_notes']),
        sellerName: json['seller_type'] == 'dawabag' ? 'Dawabag' : asString(json['partner_name']),
        createdAt: asString(json['created_at']),
        decidedAt: asString(json['decided_at']),
        items: asMapList(json['items']).map(ReturnItem.fromJson).toList(),
        creditNotes: CreditNote.listFrom(json['credit_notes']),
        refunds: Refund.listFrom(json['refunds']),
      );

  static List<ReturnRequest> listFrom(Object? raw) =>
      asMapList(raw).map(ReturnRequest.fromJson).toList();
}
