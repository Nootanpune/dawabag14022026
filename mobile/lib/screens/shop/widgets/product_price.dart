import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../utils/formatters.dart';

/// The buyer's price from the server, with MRP and discount when there is one.
class ProductPrice extends StatelessWidget {
  final Map<String, dynamic> product;
  const ProductPrice({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final discount = product['discount_pct'] as num? ?? 0;
    return Wrap(
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 10,
      runSpacing: 4,
      children: [
        Text(formatPrice(product['offer_price_paise'] ?? 0),
            style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: AppTheme.brandGreen700)),
        if (discount > 0) ...[
          Text('MRP ${formatPrice(product['mrp_paise'] ?? 0)}',
              style: TextStyle(fontSize: 14, color: Colors.grey.shade600, decoration: TextDecoration.lineThrough)),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(color: AppTheme.brandGreen50, borderRadius: BorderRadius.circular(6)),
            child: Text('$discount% off',
                style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.brandGreen700)),
          ),
        ],
      ],
    );
  }
}
