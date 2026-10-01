import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../providers/cart_actions.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/product_image.dart';

/// One search result: thumbnail, name, generic name, price and Add.
class SearchResultTile extends ConsumerWidget {
  final Map<String, dynamic> product;
  const SearchResultTile({super.key, required this.product});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inStock = product['in_stock'] as bool? ?? false;
    final generic = product['generic_name']?.toString();
    final schedule = product['drug_schedule']?.toString();
    final rx = schedule == 'Schedule H' || schedule == 'Schedule H1';
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => context.push('/shop/${product['id']}'),
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Row(
            children: [
              ProductImage.fromProduct(product, width: 56, height: 56, compact: true,
                  borderRadius: BorderRadius.circular(10)),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(product['name']?.toString() ?? '',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    if (generic != null && generic.isNotEmpty)
                      Text(generic,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                    const SizedBox(height: 4),
                    Row(children: [
                      Text(formatPrice(product['offer_price_paise'] ?? 0),
                          style: const TextStyle(fontWeight: FontWeight.w700, color: AppTheme.brandGreen700)),
                      // Prescription-only medicine (C-08)
                      if (rx) ...[
                        const SizedBox(width: 8),
                        const Text('Rx', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: AppTheme.amberText)),
                      ],
                    ]),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              inStock
                  ? FilledButton.tonal(
                      onPressed: () => addProductToCart(context, ref, product),
                      style: FilledButton.styleFrom(minimumSize: const Size(64, 36)),
                      child: const Text('Add'),
                    )
                  : Text('Out of stock', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ],
          ),
        ),
      ),
    );
  }
}
