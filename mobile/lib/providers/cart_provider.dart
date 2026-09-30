import 'package:flutter_riverpod/flutter_riverpod.dart';

class CartItem {
  final String productId;
  final String name;
  final String sku;
  int quantity;
  final int unitPricePaise;
  final int mrpPaise;
  final String drugSchedule;
  final int maxQty;
  final bool coldChain;

  CartItem({
    required this.productId,
    required this.name,
    required this.sku,
    required this.quantity,
    required this.unitPricePaise,
    required this.mrpPaise,
    required this.drugSchedule,
    required this.maxQty,
    this.coldChain = false,
  });

  CartItem copyWith({int? quantity}) => CartItem(
        productId: productId,
        name: name,
        sku: sku,
        quantity: quantity ?? this.quantity,
        unitPricePaise: unitPricePaise,
        mrpPaise: mrpPaise,
        drugSchedule: drugSchedule,
        maxQty: maxQty,
        coldChain: coldChain,
      );

  int get lineTotalPaise => unitPricePaise * quantity;
}

class CartState {
  final List<CartItem> items;
  final String? couponCode;
  final int couponDiscountPaise;

  const CartState({
    this.items = const [],
    this.couponCode,
    this.couponDiscountPaise = 0,
  });

  CartState copyWith({
    List<CartItem>? items,
    String? couponCode,
    int? couponDiscountPaise,
  }) =>
      CartState(
        items: items ?? this.items,
        couponCode: couponCode ?? this.couponCode,
        couponDiscountPaise: couponDiscountPaise ?? this.couponDiscountPaise,
      );

  int get subtotal => items.fold(0, (s, i) => s + i.lineTotalPaise);
  int get itemCount => items.fold(0, (s, i) => s + i.quantity);

  bool get requiresPrescription =>
      items.any((i) => i.drugSchedule == 'Schedule H' || i.drugSchedule == 'Schedule H1');
}

class CartNotifier extends StateNotifier<CartState> {
  CartNotifier() : super(const CartState());

  void addItem(CartItem item) {
    final existing = state.items.indexWhere((i) => i.productId == item.productId);
    if (existing >= 0) {
      final updated = List<CartItem>.from(state.items);
      final newQty = (updated[existing].quantity + 1).clamp(1, item.maxQty);
      updated[existing] = updated[existing].copyWith(quantity: newQty);
      state = state.copyWith(items: updated);
    } else {
      state = state.copyWith(items: [...state.items, item]);
    }
  }

  void removeItem(String productId) {
    state = state.copyWith(
      items: state.items.where((i) => i.productId != productId).toList(),
    );
  }

  void updateQty(String productId, int qty) {
    if (qty <= 0) { removeItem(productId); return; }
    final updated = state.items.map((i) =>
        i.productId == productId ? i.copyWith(quantity: qty.clamp(1, i.maxQty)) : i,
    ).toList();
    state = state.copyWith(items: updated);
  }

  void setCoupon(String code, int discountPaise) {
    state = CartState(
      items: state.items,
      couponCode: code,
      couponDiscountPaise: discountPaise,
    );
  }

  void removeCoupon() {
    state = CartState(items: state.items);
  }

  void clear() {
    state = const CartState();
  }
}

final cartProvider = StateNotifierProvider<CartNotifier, CartState>(
  (_) => CartNotifier(),
);
