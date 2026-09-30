import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/cart_view.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/summary_row.dart';

/// Server amounts only (subtotal, discount). Delivery and GST are computed by
/// the server when the order is created and shown at checkout.
class CartSummaryCard extends StatelessWidget {
  final CartView cart;

  const CartSummaryCard({super.key, required this.cart});

  @override
  Widget build(BuildContext context) {
    final coupon = cart.coupon;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SummaryRow('Subtotal (${cart.itemCount} items)', formatPrice(cart.subtotalPaise),
                bold: true, valueColor: AppTheme.brandGreen600),
            if (cart.discountPaise > 0) ...[
              const SizedBox(height: 8),
              SummaryRow(
                coupon != null ? 'Discount (${coupon.code})' : 'Discount',
                '–${formatPrice(cart.discountPaise)}',
                valueColor: Colors.green,
              ),
            ],
            const SizedBox(height: 8),
            Text('Delivery charges and GST are added at checkout.',
                style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
          ],
        ),
      ),
    );
  }
}
