import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/cart_view.dart';
import '../services/api_service.dart';
import '../services/api_utils.dart';
import '../services/cart_api.dart';
import 'auth_provider.dart';

/// In-memory mirror of the server cart. The server is the only authority:
/// every change is a request, and the state is replaced by the returned
/// CartView. There is no guest cart.
class CartState {
  final CartView view;
  final bool isLoading;
  final bool isUpdating;
  final String? error;

  const CartState({
    this.view = CartView.empty,
    this.isLoading = false,
    this.isUpdating = false,
    this.error,
  });

  int get itemCount => view.itemCount;

  CartState copyWith({CartView? view, bool? isLoading, bool? isUpdating, String? error}) =>
      CartState(
        view: view ?? this.view,
        isLoading: isLoading ?? this.isLoading,
        isUpdating: isUpdating ?? this.isUpdating,
        error: error,
      );
}

class CartNotifier extends StateNotifier<CartState> {
  CartNotifier() : super(const CartState());

  /// Bumped on sign-out so late responses for the old session are ignored.
  int _generation = 0;

  void reset() {
    _generation++;
    state = const CartState();
  }

  /// GET /cart
  Future<void> load() async {
    final gen = _generation;
    state = state.copyWith(isLoading: true, error: state.error);
    try {
      final view = await apiService.getCart();
      if (!mounted || gen != _generation) return;
      state = CartState(view: view);
    } catch (e) {
      if (!mounted || gen != _generation) return;
      state = state.copyWith(
        isLoading: false,
        error: ApiService.errorMessage(e, fallback: 'Could not load your cart'),
      );
    }
  }

  /// Runs a cart mutation; returns an error message or null on success.
  Future<String?> _mutate(Future<CartView> Function() call, String fallback) async {
    final gen = _generation;
    state = state.copyWith(isUpdating: true);
    try {
      final view = await call();
      if (!mounted || gen != _generation) return null;
      state = CartState(view: view);
      return null;
    } catch (e) {
      final message = ApiService.errorMessage(e, fallback: fallback);
      if (mounted && gen == _generation) {
        state = state.copyWith(isUpdating: false);
        // Sprint 38: paused while the cart was open — fetch the server's lines
        // again so the held ones show why (the refusal's text is returned as is).
        if (isRxSalesPaused(e)) load();
        // Sprint 39: 403 NOT_FOR_ONLINE_SALE (C-10) — a line already in the cart then shows why
        if (isNotForOnlineSale(e) && state.view.items.isNotEmpty) load();
        // Sprint 47: 403 BUYER_RESTRICTED — who may buy it changed; a line already in the cart then shows why
        if (isBuyerRestricted(e) && state.view.items.isNotEmpty) load();
      }
      return message;
    }
  }

  /// PUT /cart/items/:productId { quantity } (absolute; 0 removes).
  Future<String?> setQuantity(String productId, int quantity) => _mutate(
        () => apiService.setCartItemQuantity(productId, quantity < 0 ? 0 : quantity),
        'Could not update your cart',
      );

  /// "Add to cart" = PUT with (current server quantity + 1).
  Future<String?> addOne(String productId) {
    final current = state.view.lineFor(productId)?.quantity ?? 0;
    return setQuantity(productId, current + 1);
  }

  Future<String?> remove(String productId) => setQuantity(productId, 0);

  /// PUT /cart/coupon { code }. Invalid codes come back as a 400 message.
  Future<String?> applyCoupon(String code) =>
      _mutate(() => apiService.setCartCoupon(code), 'Invalid coupon');

  Future<String?> removeCoupon() =>
      _mutate(() => apiService.setCartCoupon(null), 'Could not remove the coupon');

  /// DELETE /cart
  Future<String?> clear() =>
      _mutate(() => apiService.clearCart(), 'Could not clear your cart');
}

final cartProvider = StateNotifierProvider<CartNotifier, CartState>((ref) {
  final notifier = CartNotifier();
  ref.listen<bool>(
    authProvider.select((s) => s.isAuthenticated),
    (previous, isAuthenticated) {
      if (isAuthenticated) {
        notifier.load();
      } else {
        notifier.reset();
      }
    },
    fireImmediately: true,
  );
  return notifier;
});
