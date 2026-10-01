import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../providers/auth_provider.dart';
import '../../providers/cart_provider.dart';
import 'widgets/cart_coupon_card.dart';
import 'widgets/cart_line_card.dart';
import 'widgets/cart_message_view.dart';
import 'widgets/cart_prescription_notice.dart';
import 'widgets/cart_summary_card.dart';

/// Renders the server CartView. Every change is a server call; the screen
/// never computes prices.
class CartScreen extends ConsumerWidget {
  const CartScreen({super.key});

  // Waits for the server, then shows its refusal only if this screen is still open
  Future<void> _run(BuildContext context, Future<String?> action) async {
    final error = await action;
    if (!context.mounted) return;
    _showError(context, error);
  }

  void _showError(BuildContext context, String? error) {
    if (error == null || !context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error), backgroundColor: Colors.red),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final isAuth = ref.watch(authProvider.select((s) => s.isAuthenticated));
    final cartState = ref.watch(cartProvider);
    final notifier = ref.read(cartProvider.notifier);
    final cart = cartState.view;

    if (!isAuth) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart')),
        body: CartMessageView(
          icon: Icons.shopping_cart_outlined,
          title: 'Sign in to see your cart',
          subtitle: 'Your cart is saved to your account.',
          buttonLabel: 'Sign in',
          onPressed: () => context.push('/auth/login'),
        ),
      );
    }

    if (cartState.isLoading && cart.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart')),
        body: const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
      );
    }

    if (cartState.error != null && cart.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart')),
        body: CartMessageView(
          icon: Icons.cloud_off_outlined,
          title: 'Could not load your cart',
          subtitle: cartState.error ?? '',
          buttonLabel: 'Try again',
          onPressed: notifier.load,
        ),
      );
    }

    if (cart.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart')),
        body: CartMessageView(
          icon: Icons.shopping_cart_outlined,
          title: 'Your cart is empty',
          subtitle: 'Browse medicines and add them here',
          buttonLabel: 'Browse medicines',
          onPressed: () => context.go('/'),
        ),
      );
    }

    final busy = cartState.isUpdating;
    final canCheckout = !busy && cart.orderableItems.isNotEmpty;

    return Scaffold(
      appBar: AppBar(
        title: Text('Cart (${cart.itemCount})'),
        actions: [
          TextButton(
            onPressed: busy ? null : () => _run(context, notifier.clear()),
            child: const Text('Clear', style: TextStyle(color: Colors.red, fontSize: 13)),
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppTheme.brandGreen,
        onRefresh: notifier.load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (busy) const LinearProgressIndicator(minHeight: 2),
            for (final line in cart.items)
              CartLineCard(
                line: line,
                busy: busy,
                onQuantityChange: (q) => _run(context, notifier.setQuantity(line.productId, q)),
                onRemove: () => _run(context, notifier.remove(line.productId)),
              ),
            const SizedBox(height: 12),
            if (cart.requiresPrescription) const CartPrescriptionNotice(),
            CartCouponCard(
              coupon: cart.coupon,
              busy: busy,
              onApply: notifier.applyCoupon,
              onRemove: () => _run(context, notifier.removeCoupon()),
            ),
            const SizedBox(height: 12),
            CartSummaryCard(cart: cart),
            if (cart.hasIssues) ...[
              const SizedBox(height: 8),
              const Text(
                'Items with a problem are shown in red and will not be included in your order.',
                style: TextStyle(fontSize: 12, color: AppTheme.errorRed),
              ),
            ],
            const SizedBox(height: 80),
          ],
        ),
      ),
      bottomNavigationBar: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
          child: ElevatedButton(
            onPressed: canCheckout ? () => context.push('/checkout') : null,
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text('Proceed to checkout'),
                SizedBox(width: 8),
                Icon(Icons.arrow_forward, size: 18),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
