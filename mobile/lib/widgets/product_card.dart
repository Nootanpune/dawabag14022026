import 'package:flutter/material.dart';
import '../config/theme.dart';
import '../utils/formatters.dart';
import 'product_image.dart';
import '../utils/buyer_restriction.dart';
import '../utils/drug_schedule.dart';
import 'shop/buyer_restriction_note.dart';

class ProductCard extends StatelessWidget {
  final Map<String, dynamic> product;
  final void Function(Map<String, dynamic>) onAddToCart;
  final VoidCallback onTap;
  /// Replaces the plain Add button, e.g. a CartQuantityControl (Add → − qty +)
  final Widget? cartControl;

  const ProductCard({super.key, required this.product, required this.onAddToCart, required this.onTap, this.cartControl});

  @override
  Widget build(BuildContext context) {
    final schedule = product['drug_schedule'] as String? ?? 'OTC';
    final inStock = product['in_stock'] as bool? ?? false;
    final discountPct = product['discount_pct'] as int? ?? 0;
    final isH = isRxSchedule(schedule);   // Non-scheduled / OTC: plain badge (Sprint 31)
    // Sprint 47: who may buy it. A buyer who may not sees the label in place of Add;
    // one who may sees it as a one-line note above the price.
    final restrictionLabel = buyerRestrictionLabel(product);
    final restricted = buyerMayNotBuy(product);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border.all(color: Colors.grey.shade200),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Image area: network image or a brand-tinted placeholder
            ProductImage.fromProduct(
              product,
              height: 90,
              width: double.infinity,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
            ),

            Padding(
              padding: const EdgeInsets.all(10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product['name'] ?? '',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
                    maxLines: 2, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 3),
                  if (product['marketed_by'] != null)
                    Text(product['marketed_by'], style: TextStyle(fontSize: 10, color: Colors.grey.shade500),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 6),

                  // Schedule badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: isH ? const Color(0xFFFAEEDA) : AppTheme.brandTeal50,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(schedule, style: TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w600,
                      color: isH ? const Color(0xFF633806) : AppTheme.brandTeal700,
                    )),
                  ),
                  const SizedBox(height: 6),
                  if (restrictionLabel != null && !restricted) ...[
                    Text(restrictionLabel,
                        key: const ValueKey('buyer-restriction-line'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: Color(0xFF0C4A6E))),
                    const SizedBox(height: 4),
                  ],

                  // Price
                  Wrap(
                    spacing: 4,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(formatPrice(product['offer_price_paise'] ?? 0),
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.brandTeal)),
                      if (discountPct > 0)
                        Text('$discountPct% off',
                          style: const TextStyle(fontSize: 10, color: AppTheme.brandTeal700, fontWeight: FontWeight.w600)),
                    ],
                  ),
                  const SizedBox(height: 8),

                  // Add button (or − qty + once in the cart)
                  if (cartControl != null) cartControl!
                  else if (restricted) BuyerRestrictedLabel(label: restrictionLabel ?? 'Not available to your account', height: 32)
                  else SizedBox(
                    width: double.infinity,
                    height: 32,
                    child: ElevatedButton(
                      onPressed: inStock ? () => onAddToCart(product) : null,
                      style: ElevatedButton.styleFrom(
                        padding: EdgeInsets.zero,
                        minimumSize: Size.zero,
                        textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      child: Text(inStock ? 'Add to cart' : 'Out of stock'),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
