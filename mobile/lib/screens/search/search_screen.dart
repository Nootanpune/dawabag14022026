import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../providers/typeahead_provider.dart' show kTypeaheadDebounce;
import '../../widgets/cart_action_button.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/home/search_entry.dart';
import '../../widgets/trade_price_banner.dart';
import 'widgets/search_results_list.dart';
import 'widgets/search_sort_bar.dart';

/// Search tab: server search by brand or generic name as the user types
/// (debounced), sortable by price, with "Did you mean" and the prescription
/// upload when nothing is found. The query lives in memory only.
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
  String _sort = 'relevance';

  void _useSuggestion(String text) {
    _debounce?.cancel();
    _controller.text = text;
    setState(() => _query = text);
  }

  void _onChanged(String text) {
    _debounce?.cancel();
    // Sprint 34: the same 250 ms as the home search box (kTypeaheadDebounce)
    _debounce = Timer(kTypeaheadDebounce, () {
      if (mounted) setState(() => _query = text.trim());
    });
  }

  // The home search box opens this tab with ?q= (Sprint 32); a new query replaces the old one
  @override
  void didUpdateWidget(covariant SearchScreen oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.initialQuery != oldWidget.initialQuery && widget.initialQuery.trim().isNotEmpty) {
      _debounce?.cancel();
      _controller.text = widget.initialQuery;
      _query = widget.initialQuery.trim();
    }
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
      body: Column(children: [
        // Sprint 34: lapsed drug licence → retail prices, and why (C-14)
        const TradePriceBanner(margin: EdgeInsets.fromLTRB(16, 8, 16, 0)),
        if (_query.isEmpty)
          const Expanded(
            child: EmptyState(
              icon: Icons.search,
              title: 'Search for a medicine',
              hint: 'Type a brand or generic name, e.g. paracetamol or cetirizine.',
            ),
          )
        else ...[
          SearchSortBar(value: _sort, onChanged: (s) => setState(() => _sort = s)),
          Expanded(child: SearchResultsList(query: _query, sort: _sort, onSuggestion: _useSuggestion)),
        ],
      ]),
    );
  }
}

