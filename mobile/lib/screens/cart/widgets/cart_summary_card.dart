import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/cart_view.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/summary_row.dart';
import 'free_delivery_progress.dart';

/// Server amounts only (subtotal, discount). The cart API does not return a
/// delivery charge: the server works it out per shipment from the delivery
/// pincode at checkout (POST /orders/preview), so it is named here as a line
/// and shown with its amount on the checkout summary. Retail free delivery
/// (amount and how much more is needed) comes from the cart API too.
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
                bold: true, valueColor: AppTheme.brandTeal),
            if (cart.discountPaise > 0) ...[
              const SizedBox(height: 8),
              SummaryRow(
                coupon != null ? 'Discount (${coupon.code})' : 'Discount',
                '–${formatPrice(cart.discountPaise)}',
                valueColor: AppTheme.brandLeafDark,
              ),
            ],
            const SizedBox(height: 8),
            SummaryRow('Delivery charge', cart.freeDelivery?.reached == true ? 'Free' : 'Shown at checkout',
                valueColor: cart.freeDelivery?.reached == true ? AppTheme.brandTeal : Colors.grey.shade700),
            if (cart.freeDelivery != null) ...[
              const SizedBox(height: 10),
              FreeDeliveryProgress(offer: cart.freeDelivery!),
            ],
            const SizedBox(height: 8),
            Text('The delivery charge depends on your delivery pincode. You see the full '
                'total, with delivery and GST, before you pay.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
          ],
        ),
      ),
    );
  }
}
