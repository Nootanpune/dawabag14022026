import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../config/theme.dart';
import '../utils/buyer_restriction.dart';
import '../utils/drug_schedule.dart';
import 'auth_provider.dart';
import 'cart_provider.dart';

/// Shared "Add to cart" action for product lists and detail pages.
/// Guests are sent to sign in (there is no guest cart). Returns true when
/// the server accepted the change.
/// [quantity] (product page): how many to put in; otherwise the buyer's
/// minimum (from the search/product data), or one more than in the cart.
Future<bool> addProductToCart(
  BuildContext context,
  WidgetRef ref,
  Map<String, dynamic> product, {
  int? quantity,
}) async {
  final messenger = ScaffoldMessenger.of(context);
  final schedule = product['drug_schedule'] as String? ?? 'OTC';
  if (isNeverOnline(schedule)) {
    messenger.showSnackBar(const SnackBar(
      content: Text('This medicine cannot be ordered online'),
      backgroundColor: Colors.red,
    ));
    return false;
  }
  // Sprint 47: the server says this buyer may not buy it — its label, no request
  if (buyerMayNotBuy(product)) {
    messenger.showSnackBar(cartErrorSnackBar(buyerRestrictionLabel(product) ?? 'This product is not available to your account'));
    return false;
  }
  if (!(product['in_stock'] as bool? ?? false)) {
    messenger.showSnackBar(const SnackBar(content: Text('Out of stock')));
    return false;
  }
  if (!ref.read(authProvider).isAuthenticated) {
    messenger.showSnackBar(const SnackBar(content: Text('Sign in to add items to your cart')));
    context.push('/auth/login');
    return false;
  }

  final productId = product['id']?.toString();
  if (productId == null) return false;
  final notifier = ref.read(cartProvider.notifier);
  final inCart = ref.read(cartProvider).view.lineFor(productId)?.quantity ?? 0;
  final minQty = (product['min_order_qty'] as num?)?.toInt() ?? 1;
  final error = quantity != null || inCart == 0
      ? await notifier.setQuantity(productId, inCart + (quantity ?? (minQty < 1 ? 1 : minQty)))
      : await notifier.addOne(productId);
  if (error != null) {
    messenger.showSnackBar(cartErrorSnackBar(error));
    return false;
  }
  messenger.showSnackBar(SnackBar(
    content: Text('${product['name'] ?? 'Item'} added to your cart'),
    backgroundColor: AppTheme.brandTeal,
    duration: const Duration(seconds: 2),
  ));
  return true;
}

/// − / + on a cart line or a product already in the cart (Sprint 26). Below the
/// buyer's minimum the line is removed; the server checks the limits again.
Future<void> changeCartQuantity(BuildContext context, WidgetRef ref, String productId, int quantity) async {
  final messenger = ScaffoldMessenger.of(context);
  final error = await ref.read(cartProvider.notifier).setQuantity(productId, quantity);
  if (error != null) {
    messenger.showSnackBar(cartErrorSnackBar(error));
  }
}

/// A cart refusal in the server's own words. Long ones (e.g. the Sprint 38
/// emergency-stop message, C-08) stay up long enough to read.
SnackBar cartErrorSnackBar(String message) => SnackBar(
      content: Text(message),
      backgroundColor: Colors.red,
      duration: Duration(seconds: message.length > 90 ? 8 : 4),
    );
