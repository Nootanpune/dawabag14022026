import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../providers/cart_actions.dart';
import '../../../services/api_service.dart';
import '../../../widgets/empty_state.dart';
import '../../../widgets/error_retry_view.dart';
import '../../../widgets/product_card.dart';

// Fixed tile height (not an aspect ratio) so two-line names, the maker and
// the button never overflow on narrow phones.
const _gridDelegate = SliverGridDelegateWithFixedCrossAxisCount(
  crossAxisCount: 2,
  mainAxisExtent: 268,
  crossAxisSpacing: 12,
  mainAxisSpacing: 12,
);

/// Sliver product grid for a server search result, with loading, error and
/// empty states.
class ProductGrid extends ConsumerWidget {
  final AsyncValue<Map<String, dynamic>> products;
  final VoidCallback onRetry;
  final VoidCallback? onClearFilter;

  const ProductGrid({super.key, required this.products, required this.onRetry, this.onClearFilter});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return products.when(
      data: (data) {
        final list = ((data['products'] as List?) ?? const []).cast<Map<String, dynamic>>();
        if (list.isEmpty) {
          return SliverToBoxAdapter(
            child: EmptyState(
              icon: Icons.medication_outlined,
              title: 'No medicines here yet',
              hint: 'Try another category, or search by brand or generic name.',
              actionLabel: onClearFilter == null ? null : 'Show all medicines',
              onAction: onClearFilter,
            ),
          );
        }
        return SliverPadding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          sliver: SliverGrid(
            gridDelegate: _gridDelegate,
            delegate: SliverChildBuilderDelegate(
              (context, i) => ProductCard(
                product: list[i],
                onAddToCart: (product) => addProductToCart(context, ref, product),
                onTap: () => context.push('/shop/${list[i]['id']}'),
              ),
              childCount: list.length,
            ),
          ),
        );
      },
      loading: () => SliverPadding(
        padding: const EdgeInsets.symmetric(horizontal: 16),
        sliver: SliverGrid(
          gridDelegate: _gridDelegate,
          delegate: SliverChildBuilderDelegate(
            (_, __) => DecoratedBox(
              decoration: BoxDecoration(
                color: Colors.grey.shade100,
                borderRadius: BorderRadius.circular(12),
              ),
            ),
            childCount: 4,
          ),
        ),
      ),
      error: (err, _) => SliverToBoxAdapter(
        child: ErrorRetryView(
          message: ApiService.errorMessage(err, fallback: 'Could not load medicines'),
          onRetry: onRetry,
        ),
      ),
    );
  }
}
