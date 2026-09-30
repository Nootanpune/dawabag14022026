/// Refill subscription + payment mandate JSON from /api/v1/refills
/// (Sprint 3 contract, section D). Plain value objects: the server is the
/// only authority, these are rebuilt from every response.

int _asInt(Object? v, [int fallback = 0]) {
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v) ?? num.tryParse(v)?.round() ?? fallback;
  return fallback;
}

String? _asString(Object? v) => v?.toString();

List<Map<String, dynamic>> _asMapList(Object? v) => v is List
    ? v.whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList()
    : const [];

class RefillItem {
  final String productId;
  final String name;
  final int quantity;

  const RefillItem({required this.productId, required this.name, required this.quantity});

  factory RefillItem.fromJson(Map<String, dynamic> json) => RefillItem(
        productId: _asString(json['product_id']) ?? '',
        name: _asString(json['name']) ?? '',
        quantity: _asInt(json['quantity']),
      );
}

class Refill {
  final String id;
  final String? orderId;
  final String? sourceOrderNumber;
  final int frequencyDays;
  final String? nextRefillDate;
  final bool isActive;
  final bool autoCharge;
  final String? mandateId;
  final String? mandateStatus;
  final String? lastOrderId;
  final List<RefillItem> items;

  const Refill({
    required this.id,
    this.orderId,
    this.sourceOrderNumber,
    required this.frequencyDays,
    this.nextRefillDate,
    required this.isActive,
    required this.autoCharge,
    this.mandateId,
    this.mandateStatus,
    this.lastOrderId,
    this.items = const [],
  });

  /// Automatic payment is on when a mandate is attached and the server says
  /// it is active (or auto_charge is set).
  bool get automaticPaymentOn => mandateId != null && (autoCharge || mandateStatus == 'active');

  factory Refill.fromJson(Map<String, dynamic> json) => Refill(
        id: _asString(json['id']) ?? '',
        orderId: _asString(json['order_id']),
        sourceOrderNumber: _asString(json['source_order_number']),
        frequencyDays: _asInt(json['frequency_days'], 30),
        nextRefillDate: _asString(json['next_refill_date']),
        isActive: json['is_active'] == true,
        autoCharge: json['auto_charge'] == true,
        mandateId: _asString(json['mandate_id']),
        mandateStatus: _asString(json['mandate_status']),
        lastOrderId: _asString(json['last_order_id']),
        items: _asMapList(json['items']).map(RefillItem.fromJson).toList(),
      );

  static List<Refill> listFrom(Map<String, dynamic> data) =>
      _asMapList(data['refills']).map(Refill.fromJson).toList();
}

class PaymentMandate {
  final String id;
  final String method;
  final int maxAmountPaise;
  final String status;
  final String? createdAt;
  final String? activatedAt;

  const PaymentMandate({
    required this.id,
    required this.method,
    required this.maxAmountPaise,
    required this.status,
    this.createdAt,
    this.activatedAt,
  });

  bool get isActive => status == 'active';
  bool get isCancelled => status == 'cancelled';

  factory PaymentMandate.fromJson(Map<String, dynamic> json) => PaymentMandate(
        id: _asString(json['id']) ?? '',
        method: _asString(json['method']) ?? '',
        maxAmountPaise: _asInt(json['max_amount_paise']),
        status: _asString(json['status']) ?? '',
        createdAt: _asString(json['created_at']),
        activatedAt: _asString(json['activated_at']),
      );

  static List<PaymentMandate> listFrom(Map<String, dynamic> data) =>
      _asMapList(data['mandates']).map(PaymentMandate.fromJson).toList();
}

/// POST /refills/mandates response: what Razorpay Checkout (recurring) needs.
class MandateStart {
  final String mandateId;
  final String razorpayOrderId;
  final String? customerId;
  final String? keyId;
  final String recurring;

  const MandateStart({
    required this.mandateId,
    required this.razorpayOrderId,
    this.customerId,
    this.keyId,
    this.recurring = '1',
  });

  factory MandateStart.fromJson(Map<String, dynamic> json) => MandateStart(
        mandateId: _asString(json['mandate_id']) ?? '',
        razorpayOrderId: _asString(json['razorpay_order_id']) ?? '',
        customerId: _asString(json['customer_id']),
        keyId: _asString(json['key_id']),
        recurring: _asString(json['recurring']) ?? '1',
      );
}
