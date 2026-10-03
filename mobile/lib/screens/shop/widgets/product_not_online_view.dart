import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../services/api_utils.dart';
import '../../../widgets/empty_state.dart';

/// Sprint 39 (C-10): GET /products/:id answers 404 for a product Dawabag may
/// not sell online (not allowed for online sale, or no longer sold). The buyer
/// gets a plain page with a way on, not an error to retry.
class ProductNotOnlineView extends StatelessWidget {
  const ProductNotOnlineView({super.key});

  /// True when the product page's error means "not offered online".
  static bool matches(Object error) => apiErrorStatus(error) == 404;

  @override
  Widget build(BuildContext context) => EmptyState(
        key: const ValueKey('product-not-online'),
        icon: Icons.storefront_outlined,
        title: 'Not available online',
        hint: 'Dawabag cannot sell this product online right now. '
            'Search for another medicine, or ask your doctor or pharmacist about an alternative.',
        actionLabel: 'Search medicines',
        onAction: () => context.go('/search'),
      );
}
