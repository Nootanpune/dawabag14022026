import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../providers/auth_provider.dart';
import '../../providers/cart_actions.dart' show cartErrorSnackBar;
import '../../providers/cart_provider.dart';
import 'widgets/cart_coupon_card.dart';
import 'widgets/cart_line_card.dart';
import 'widgets/cart_prescription_notice.dart';
import 'widgets/add_more_sheet.dart';
import 'widgets/cart_summary_card.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/rx_sales_banner.dart';
import '../../widgets/trade_price_banner.dart';

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
    ScaffoldMessenger.of(context).showSnackBar(cartErrorSnackBar(error));
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
        body: EmptyState(
          icon: Icons.shopping_cart_outlined,
          title: 'Sign in to see your cart',
          hint: 'Your cart is kept with your account, so it is there on any device.',
          actionLabel: 'Sign in',
          onAction: () => context.push('/auth/login'),
        ),
      );
    }

    if (cartState.isLoading && cart.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart')),
        body: const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
      );
    }

    if (cartState.error != null && cart.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart')),
        body: EmptyState(
          icon: Icons.cloud_off_outlined,
          title: 'Could not load your cart',
          hint: cartState.error,
          actionLabel: 'Try again',
          onAction: notifier.load,
        ),
      );
    }

    if (cart.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Cart')),
        body: ListView(children: [
          EmptyState(
            icon: Icons.shopping_cart_outlined,
            title: 'Your cart is empty',
            hint: 'Search for a medicine by brand or generic name and add it here.',
            actionLabel: 'Search medicines',
            onAction: () => showAddMoreSheet(context),
          ),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: OutlinedButton.icon(
              onPressed: () => context.push('/account/prescriptions'),
              icon: const Icon(Icons.upload_file, size: 20),
              label: const Text('Have a prescription? Upload it'),
            ),
          ),
        ]),
      );
    }

    final busy = cartState.isUpdating;
    // Sprint 38: the server refuses checkout while paused prescription lines are in the cart
    final canCheckout = !busy && cart.orderableItems.isNotEmpty && !cart.hasPausedItems;

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
        color: AppTheme.brandTeal,
        onRefresh: notifier.load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (busy) const LinearProgressIndicator(minHeight: 2),
            // Sprint 34: lapsed drug licence → retail prices, and why (C-14)
            const TradePriceBanner(margin: EdgeInsets.only(bottom: 12)),
            // Sprint 38: emergency stop on prescription medicines (C-08)
            RxSalesBanner(serverMessage: cart.rxSalesPaused, margin: const EdgeInsets.only(bottom: 12)),
            for (final line in cart.items)
              CartLineCard(
                line: line,
                busy: busy,
                rxPaused: cart.rxSalesPaused != null && line.requiresPrescription,
                onQuantityChange: (q) => _run(context, notifier.setQuantity(line.productId, q)),
                onRemove: () => _run(context, notifier.remove(line.productId)),
              ),
            // Search and add without leaving the cart (Sprint 25)
            OutlinedButton.icon(
              onPressed: busy ? null : () => showAddMoreSheet(context),
              icon: const Icon(Icons.add, size: 20),
              label: const Text('Add more medicines'),
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
            if (cart.hasPausedItems) ...[
              const SizedBox(height: 8),
              Text(
                cart.pausedCheckoutMessage,
                key: const ValueKey('cart-paused-checkout'),
                style: const TextStyle(fontSize: 12, color: AppTheme.errorRed),
              ),
            ],
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
