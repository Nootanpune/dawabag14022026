import '../models/cart_view.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Server cart endpoints (SSOT contract). Every call returns the CartView.
extension CartApi on ApiService {
  Future<CartView> getCart() async {
    final res = await dio.get('/cart');
    return CartView.fromJson(apiData(res));
  }

  /// Absolute quantity; 0 removes the line.
  Future<CartView> setCartItemQuantity(String productId, int quantity) async {
    final res = await dio.put('/cart/items/$productId', data: {'quantity': quantity});
    return CartView.fromJson(apiData(res));
  }

  /// null or '' removes the coupon; an invalid code is a 400 with a message.
  Future<CartView> setCartCoupon(String? code) async {
    final res = await dio.put('/cart/coupon', data: {'code': code});
    return CartView.fromJson(apiData(res));
  }

  Future<CartView> clearCart() async {
    final res = await dio.delete('/cart');
    return CartView.fromJson(apiData(res));
  }
}
