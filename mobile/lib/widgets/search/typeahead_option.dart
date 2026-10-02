import 'package:flutter/material.dart';

import '../../config/theme.dart';
import '../../utils/formatters.dart';
import '../cart_quantity_control.dart';
import '../product_image.dart';
import '../schedule_badge.dart';

/// One suggestion in the home search dropdown: name, generic name, Rx /
/// Non-scheduled badge, the buyer's price, stock, and Add that becomes − qty +
/// against the server cart (as the web's TypeaheadOption, Sprint 26).
class TypeaheadOption extends StatelessWidget {
  final Map<String, dynamic> product;
  final VoidCallback onOpen;
  const TypeaheadOption({super.key, required this.product, required this.onOpen});

  @override
  Widget build(BuildContext context) {
    final generic = product['generic_name']?.toString() ?? '';
    final inStock = product['in_stock'] == true;
    return InkWell(
      onTap: onOpen,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            ProductImage.fromProduct(product, width: 40, height: 40, compact: true, borderRadius: BorderRadius.circular(8)),
            const SizedBox(width: 10),
            // Name, generic + badge and price stacked, so − qty + always fits on a phone
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(product['name']?.toString() ?? '',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  Row(children: [
                    if (generic.isNotEmpty)
                      Flexible(
                        child: Text(generic,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                      ),
                    if (generic.isNotEmpty) const SizedBox(width: 6),
                    // Schedule H / H1: the pharmacist checks the prescription before dispatch (C-08)
                    ScheduleBadge(product['drug_schedule']?.toString()),
                  ]),
                  const SizedBox(height: 2),
                  Row(children: [
                    Text(formatPrice(product['display_price_paise'] ?? product['offer_price_paise'] ?? 0),
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.brandGreen700)),
                    if (!inStock) ...[
                      const SizedBox(width: 8),
                      Text('Out of stock', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.red.shade700)),
                    ],
                  ]),
                ],
              ),
            ),
            const SizedBox(width: 8),
            if (inStock) CartQuantityControl(product: product, compact: true),
          ],
        ),
      ),
    );
  }
}
