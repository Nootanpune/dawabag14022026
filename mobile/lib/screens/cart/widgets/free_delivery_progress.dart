import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/cart_view.dart';
import '../../../utils/formatters.dart';

/// "Add ₹X more for free delivery" — the amounts come from the server's cart.
class FreeDeliveryProgress extends StatelessWidget {
  final FreeDelivery offer;

  const FreeDeliveryProgress({super.key, required this.offer});

  @override
  Widget build(BuildContext context) {
    final text = offer.reached
        ? 'You get free delivery on this order'
        : 'Add ${formatPrice(offer.remainingPaise)} more for free delivery';
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(color: AppTheme.brandGreen50, borderRadius: BorderRadius.circular(8)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            const Icon(Icons.card_giftcard, size: 16, color: AppTheme.brandGreen700),
            const SizedBox(width: 6),
            Expanded(
              child: Text(text,
                  style: const TextStyle(fontWeight: FontWeight.w600, color: AppTheme.brandGreen700)),
            ),
          ]),
          const SizedBox(height: 8),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: offer.progress,
              minHeight: 6,
              color: AppTheme.brandGreen600,
              backgroundColor: Colors.white,
              semanticsLabel: 'Free delivery on medicines of ${formatPrice(offer.abovePaise)} or more',
            ),
          ),
          const SizedBox(height: 6),
          Text('Free delivery on medicines of ${formatPrice(offer.abovePaise)} or more.',
              style: const TextStyle(fontSize: 12, color: AppTheme.brandGreen700)),
        ],
      ),
    );
  }
}
