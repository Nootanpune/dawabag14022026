import 'dart:async';

import 'package:flutter/material.dart';

import '../../search/widgets/search_results_list.dart';

/// "Add more medicines" from the cart: search the server and Add without
/// leaving the cart. Every Add is a server cart call; the cart screen shows
/// the server's cart again when the sheet closes.
Future<void> showAddMoreSheet(BuildContext context) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => const _AddMoreSheet(),
    );

class _AddMoreSheet extends StatefulWidget {
  const _AddMoreSheet();

  @override
  State<_AddMoreSheet> createState() => _AddMoreSheetState();
}

class _AddMoreSheetState extends State<_AddMoreSheet> {
  final _controller = TextEditingController();
  Timer? _debounce;
  String _query = '';

  void _set(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 300), () {
      if (mounted) setState(() => _query = text.trim());
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.8,
        child: Column(children: [
          const Text('Add more medicines', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: TextField(
              controller: _controller,
              autofocus: true,
              textInputAction: TextInputAction.search,
              onChanged: _set,
              onSubmitted: (t) => setState(() => _query = t.trim()),
              decoration: const InputDecoration(
                hintText: 'Search by brand or generic name',
                prefixIcon: Icon(Icons.search, size: 20),
              ),
            ),
          ),
          Expanded(
            child: _query.length < 2
                ? Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text('Type at least 2 letters, e.g. paracetamol.',
                        style: TextStyle(color: Colors.grey.shade600)),
                  )
                : SearchResultsList(
                    query: _query,
                    onSuggestion: (s) {
                      _controller.text = s;
                      setState(() => _query = s);
                    },
                  ),
          ),
        ]),
      ),
    );
  }
}
