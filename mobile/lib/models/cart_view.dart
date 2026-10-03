/// The server's cart (`CartView`, SSOT contract). All prices come from the
/// server — they depend on the buyer's type and KYC — and are never computed
/// or cached on the device.
class CartLine {
  final String productId;
  final String name;
  final String? sku;
  final String? drugSchedule;
  final bool coldChain;
  final String? imageKey;
  /// Signed short-lived link to the approved pack photo (C-19), or null.
  final String? imageUrl;
  final int quantity;
  final int unitPricePaise;
  final int mrpPaise;
  final int lineSubtotalPaise;
  final int minQty;
  final int? maxQty;
  final int? stockQty;
  final bool available;
  final String? issue;
  final bool requiresPrescription;

  const CartLine({
    required this.productId,
    required this.name,
    this.sku,
    this.drugSchedule,
    this.coldChain = false,
    this.imageKey,
    this.imageUrl,
    required this.quantity,
    required this.unitPricePaise,
    required this.mrpPaise,
    required this.lineSubtotalPaise,
    this.minQty = 1,
    this.maxQty,
    this.stockQty,
    this.available = true,
    this.issue,
    this.requiresPrescription = false,
  });

  factory CartLine.fromJson(Map<String, dynamic> j) => CartLine(
        productId: j['product_id']?.toString() ?? '',
        name: j['name']?.toString() ?? '',
        sku: j['sku']?.toString(),
        drugSchedule: j['drug_schedule']?.toString(),
        coldChain: j['cold_chain'] == true,
        imageKey: j['image_key']?.toString(),
        imageUrl: j['image_url']?.toString(),
        quantity: _int(j['quantity']),
        unitPricePaise: _int(j['unit_price_paise']),
        mrpPaise: _int(j['mrp_paise']),
        lineSubtotalPaise: _int(j['line_subtotal_paise']),
        minQty: j['min_qty'] == null ? 1 : _int(j['min_qty']),
        maxQty: j['max_qty'] == null ? null : _int(j['max_qty']),
        stockQty: j['stock_qty'] == null ? null : _int(j['stock_qty']),
        available: j['available'] != false,
        issue: j['issue']?.toString(),
        requiresPrescription: j['requires_prescription'] == true,
      );

  /// Whether the + button may be offered (the server still has the final say).
  bool get canIncrease {
    final max = maxQty;
    final stock = stockQty;
    if (max != null && quantity >= max) return false;
    if (stock != null && quantity >= stock) return false;
    return true;
  }
}

class CartCoupon {
  final String code;
  final int discountPaise;
  final bool valid;
  final String? message;

  const CartCoupon({
    required this.code,
    required this.discountPaise,
    required this.valid,
    this.message,
  });

  factory CartCoupon.fromJson(Map<String, dynamic> j) => CartCoupon(
        code: j['code']?.toString() ?? '',
        discountPaise: _int(j['discount_paise']),
        valid: j['valid'] == true,
        message: j['message']?.toString(),
      );
}

/// Retail free delivery from the server (setting delivery.free_above_paise):
/// the amount and how much more is needed; 0 remaining means free.
class FreeDelivery {
  final int abovePaise;
  final int remainingPaise;

  const FreeDelivery({required this.abovePaise, required this.remainingPaise});

  bool get reached => remainingPaise == 0;

  /// 0.0–1.0 for a progress bar
  double get progress =>
      abovePaise <= 0 ? 1 : ((abovePaise - remainingPaise) / abovePaise).clamp(0.0, 1.0);

  static FreeDelivery? fromJson(Object? j) {
    if (j is! Map) return null;
    return FreeDelivery(abovePaise: _int(j['above_paise']), remainingPaise: _int(j['remaining_paise']));
  }
}

class CartView {
  final List<CartLine> items;
  final CartCoupon? coupon;
  final String? pricingType;
  final int subtotalPaise;
  final int discountPaise;
  /// null for trade buyers or when the owner has switched it off
  final FreeDelivery? freeDelivery;
  final bool requiresPrescription;
  final int itemCount;
  /// Sprint 38 emergency stop: the server's banner text while prescription
  /// medicines are paused, else null (C-08).
  final String? rxSalesPaused;

  const CartView({
    this.items = const [],
    this.coupon,
    this.pricingType,
    this.subtotalPaise = 0,
    this.discountPaise = 0,
    this.freeDelivery,
    this.requiresPrescription = false,
    this.itemCount = 0,
    this.rxSalesPaused,
  });

  static const CartView empty = CartView();

  bool get isEmpty => items.isEmpty;

  /// Lines that can be ordered now (the server reports problems in `issue`).
  List<CartLine> get orderableItems =>
      items.where((l) => l.available && l.issue == null).toList();

  /// Lines held by the emergency stop: prescription medicines for this buyer
  /// (the server's `requires_prescription`) while sales are paused. They cannot
  /// be raised, and the server refuses checkout while any is in the cart, so
  /// checkout waits until they are removed (as on the website).
  List<CartLine> get pausedItems =>
      rxSalesPaused == null ? const [] : items.where((l) => l.requiresPrescription).toList();

  bool get hasPausedItems => pausedItems.isNotEmpty;

  /// What the buyer reads when checkout is blocked by paused lines.
  String get pausedCheckoutMessage =>
      '${rxSalesPaused ?? ''} Please remove ${pausedItems.map((l) => l.name).join(', ')} from your cart to order the rest.'
          .trim();

  bool get hasIssues => items.any((l) => !l.available || l.issue != null);

  CartLine? lineFor(String productId) {
    for (final line in items) {
      if (line.productId == productId) return line;
    }
    return null;
  }

  factory CartView.fromJson(Map<String, dynamic> j) {
    final rawItems = j['items'];
    final rawCoupon = j['coupon'];
    return CartView(
      items: rawItems is List
          ? rawItems
              .whereType<Map>()
              .map((e) => CartLine.fromJson(Map<String, dynamic>.from(e)))
              .toList()
          : const [],
      coupon: rawCoupon is Map
          ? CartCoupon.fromJson(Map<String, dynamic>.from(rawCoupon))
          : null,
      pricingType: j['pricing_type']?.toString(),
      subtotalPaise: _int(j['subtotal_paise']),
      discountPaise: _int(j['discount_paise']),
      freeDelivery: FreeDelivery.fromJson(j['free_delivery']),
      requiresPrescription: j['requires_prescription'] == true,
      itemCount: _int(j['item_count']),
      rxSalesPaused: (j['rx_sales_paused'] is String && (j['rx_sales_paused'] as String).trim().isNotEmpty)
          ? (j['rx_sales_paused'] as String).trim()
          : null,
    );
  }
}

int _int(Object? v) {
  if (v is int) return v;
  if (v is num) return v.round();
  if (v is String) return int.tryParse(v) ?? 0;
  return 0;
}
