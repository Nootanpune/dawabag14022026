import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../config/theme.dart';
import 'auth_provider.dart';
import 'cart_provider.dart';

const List<String> _notOrderableOnline = ['NDPS', 'Schedule X'];

/// Shared "Add to cart" action for product lists and detail pages.
/// Guests are sent to sign in (there is no guest cart). Returns true when
/// the server accepted the change.
Future<bool> addProductToCart(
  BuildContext context,
  WidgetRef ref,
  Map<String, dynamic> product,
) async {
  final messenger = ScaffoldMessenger.of(context);
  final schedule = product['drug_schedule'] as String? ?? 'OTC';
  if (_notOrderableOnline.contains(schedule)) {
    messenger.showSnackBar(const SnackBar(
      content: Text('This medicine cannot be ordered online'),
      backgroundColor: Colors.red,
    ));
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
  final error = await ref.read(cartProvider.notifier).addOne(productId);
  if (error != null) {
    messenger.showSnackBar(SnackBar(content: Text(error), backgroundColor: Colors.red));
    return false;
  }
  messenger.showSnackBar(SnackBar(
    content: Text('${product['name'] ?? 'Item'} added to cart'),
    backgroundColor: AppTheme.brandGreen,
    duration: const Duration(seconds: 2),
  ));
  return true;
}
