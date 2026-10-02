import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../providers/catalog_provider.dart';
import '../../../services/api_service.dart';
import '../../../widgets/error_retry_view.dart';
import 'no_results_view.dart';
import 'search_result_tile.dart';

/// Server results for [query] in [sort] order, each with a quick Add.
/// Used by the Search tab and by the cart's "Add more medicines".
class SearchResultsList extends ConsumerWidget {
  final String query;
  final String sort;
  final ValueChanged<String> onSuggestion;
  final ScrollController? controller;
  const SearchResultsList({super.key, required this.query, this.sort = 'relevance', required this.onSuggestion, this.controller});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = productsQueryKey(q: query, pincode: ref.watch(browsePincodeProvider), sort: sort);
    final async = ref.watch(productsProvider(key));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorRetryView(
        message: ApiService.errorMessage(e, fallback: 'Could not search right now'),
        onRetry: () => ref.invalidate(productsProvider(key)),
      ),
      data: (data) {
        final list = ((data['products'] as List?) ?? const []).cast<Map<String, dynamic>>();
        if (list.isEmpty) return NoResultsView(query: query, onSuggestion: onSuggestion);
        final total = (data['pagination'] as Map?)?['total'] ?? list.length;
        return ListView.separated(
          controller: controller,
          padding: const EdgeInsets.all(16),
          itemCount: list.length + 1,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) => i == 0
              ? Text('$total medicine${total == 1 ? '' : 's'} found', style: TextStyle(fontSize: 13, color: Colors.grey.shade700))
              : SearchResultTile(product: list[i - 1]),
        );
      },
    );
  }
}
