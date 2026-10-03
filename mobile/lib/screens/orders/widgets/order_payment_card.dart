import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/order_payment.dart';

/// Sprint 39 (owner decision 2026-10-03; C-08, C-37): how a prescription
/// order's payment stands, in plain words — held until the pharmacist's check,
/// charged after it, or released (never charged). From the `payment` block of
/// GET /orders/:id; hidden for an ordinary payment taken at checkout.
class OrderPaymentCard extends StatelessWidget {
  final Map<String, dynamic> order;
  const OrderPaymentCard({super.key, required this.order});

  /// Whether the card has anything to say for [order].
  static bool showsFor(Map<String, dynamic> order) => OrderPayment.fromOrder(order)?.describe() != null;

  @override
  Widget build(BuildContext context) {
    final words = OrderPayment.fromOrder(order)?.describe();
    if (words == null) return const SizedBox.shrink();
    final bg = words.attention ? AppTheme.amberBadge : AppTheme.brandTeal50;
    final fg = words.attention ? AppTheme.amberText : AppTheme.brandTeal700;
    return Container(
      key: const ValueKey('order-payment-card'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(12)),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(words.attention ? Icons.hourglass_top_outlined : Icons.verified_user_outlined, color: fg, size: 20),
        const SizedBox(width: 10),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(words.title, style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: fg)),
            if (words.detail != null) ...[
              const SizedBox(height: 4),
              Text(words.detail!, style: TextStyle(fontSize: 12.5, height: 1.35, color: fg)),
            ],
          ]),
        ),
      ]),
    );
  }
}
