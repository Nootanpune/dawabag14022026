import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/product_page_extras.dart';

/// Links to the trust pages (Sprint 33); each says only what Dawabag actually does.
class ProductTrustStrip extends StatelessWidget {
  const ProductTrustStrip({super.key});

  static const _icons = [Icons.verified_outlined, Icons.event_busy_outlined, Icons.how_to_reg_outlined];

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (var i = 0; i < kInfoPages.length; i++)
            ActionChip(
              avatar: Icon(_icons[i], size: 16, color: AppTheme.brandTeal),
              label: Text(kInfoPages[i].$2, style: const TextStyle(fontSize: 12)),
              onPressed: () => context.push('/trust/${kInfoPages[i].$1}'),
            ),
        ],
      ),
    );
  }
}
