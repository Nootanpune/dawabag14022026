import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/catalog_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/cart_action_button.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_retry_view.dart';
import '../../widgets/home/search_entry.dart';
import 'widgets/search_result_tile.dart';

/// Search tab: server search by brand or generic name as the user types
/// (debounced). The query lives in memory only.
class SearchScreen extends ConsumerStatefulWidget {
  final String initialQuery;
  const SearchScreen({super.key, this.initialQuery = ''});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  late final TextEditingController _controller = TextEditingController(text: widget.initialQuery);
  Timer? _debounce;
  late String _query = widget.initialQuery.trim();

  void _onChanged(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) setState(() => _query = text.trim());
    });
  }

  void _clear() {
    _debounce?.cancel();
    _controller.clear();
    setState(() => _query = '');
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Search'),
        actions: const [CartActionButton()],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(64),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: TextField(
              controller: _controller,
              autofocus: widget.initialQuery.isEmpty,
              textInputAction: TextInputAction.search,
              onChanged: _onChanged,
              onSubmitted: (t) {
                _debounce?.cancel();
                setState(() => _query = t.trim());
              },
              decoration: InputDecoration(
                hintText: SearchEntry.hint,
                prefixIcon: const Icon(Icons.search, size: 20),
                suffixIcon: ListenableBuilder(
                  listenable: _controller,
                  builder: (_, __) => _controller.text.isEmpty
                      ? const SizedBox.shrink()
                      : IconButton(tooltip: 'Clear', icon: const Icon(Icons.clear, size: 18), onPressed: _clear),
                ),
              ),
            ),
          ),
        ),
      ),
      body: _query.isEmpty
          ? const EmptyState(
              icon: Icons.search,
              title: 'Search for a medicine',
              hint: 'Type a brand or generic name, e.g. Dolo 650 or paracetamol.',
            )
          : _Results(query: _query),
    );
  }
}

class _Results extends ConsumerWidget {
  final String query;
  const _Results({required this.query});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final key = productsQueryKey(q: query, pincode: ref.watch(browsePincodeProvider));
    final async = ref.watch(productsProvider(key));
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorRetryView(
        message: ApiService.errorMessage(e, fallback: 'Could not search right now'),
        onRetry: () => ref.invalidate(productsProvider(key)),
      ),
      data: (data) {
        final list = ((data['products'] as List?) ?? const []).cast<Map<String, dynamic>>();
        if (list.isEmpty) {
          return EmptyState(
            icon: Icons.search_off,
            title: 'No medicines found for "$query"',
            hint: 'Check the spelling, or try the generic name (e.g. paracetamol).',
          );
        }
        return ListView.separated(
          padding: const EdgeInsets.all(16),
          itemCount: list.length,
          separatorBuilder: (_, __) => const SizedBox(height: 10),
          itemBuilder: (_, i) => SearchResultTile(product: list[i]),
        );
      },
    );
  }
}
