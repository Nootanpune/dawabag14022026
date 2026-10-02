import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/theme.dart';
import '../../providers/catalog_provider.dart';
import '../../providers/typeahead_provider.dart';
import 'typeahead_option.dart';

/// The dropdown under the home search box: the server's top matches for
/// [query], "No medicines found" with "Did you mean" names (GET
/// /products/search/suggest), and "See all results" (the Search tab).
class TypeaheadPanel extends ConsumerWidget {
  final String query;
  final String pincode;
  final ValueChanged<String> onOpenProduct;
  final ValueChanged<String> onSeeAll;
  final ValueChanged<String> onSuggestion;
  final double maxHeight;

  const TypeaheadPanel({
    super.key,
    required this.query,
    this.pincode = '',
    required this.onOpenProduct,
    required this.onSeeAll,
    required this.onSuggestion,
    this.maxHeight = 420,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final q = query.trim();
    final async = ref.watch(typeaheadProvider(typeaheadKey(q, pincode: pincode)));
    final grey = TextStyle(fontSize: 13, color: Colors.grey.shade700);

    final List<Widget> rows = async.when(
      loading: () => [
        Padding(
          padding: const EdgeInsets.all(12),
          child: Row(children: [
            const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 10),
            Text('Searching…', style: grey),
          ]),
        ),
      ],
      error: (_, __) => [
        Padding(padding: const EdgeInsets.all(12), child: Text('Could not search right now. Try again.', style: grey)),
      ],
      data: (r) => r.products.isEmpty
          ? [_NoMatches(query: q, onSuggestion: onSuggestion)]
          : [
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 2),
                child: Text('${r.total} medicine${r.total == 1 ? '' : 's'} found',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              ),
              for (final p in r.products)
                TypeaheadOption(product: p, onOpen: () => onOpenProduct(p['id']?.toString() ?? '')),
            ],
    );

    return Material(
      elevation: 8,
      color: Colors.white,
      borderRadius: BorderRadius.circular(12),
      clipBehavior: Clip.antiAlias,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Flexible(child: ListView(shrinkWrap: true, padding: EdgeInsets.zero, children: rows)),
            const Divider(height: 1),
            InkWell(
              onTap: () => onSeeAll(q),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                child: Row(children: [
                  Expanded(
                    child: Text('See all results for “$q”',
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: AppTheme.brandGreen700)),
                  ),
                  const Icon(Icons.arrow_forward, size: 18, color: AppTheme.brandGreen700),
                ]),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Nothing matched: say so and offer close names from the server (never
/// Schedule X / NDPS, C-10).
class _NoMatches extends ConsumerWidget {
  final String query;
  final ValueChanged<String> onSuggestion;
  const _NoMatches({required this.query, required this.onSuggestion});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final names = ref.watch(searchSuggestionsProvider(query)).valueOrNull ?? const <String>[];
    return Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('No medicines found for “$query”.', style: const TextStyle(fontSize: 14)),
          if (names.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Did you mean:', style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 8,
              runSpacing: 4,
              children: [for (final n in names) ActionChip(label: Text(n), onPressed: () => onSuggestion(n))],
            ),
          ],
        ],
      ),
    );
  }
}
