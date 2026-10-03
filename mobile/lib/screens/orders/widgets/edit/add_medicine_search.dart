import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../models/order_edit.dart';
import '../../../../providers/typeahead_provider.dart';
import '../../../../utils/formatters.dart';

/// "Add a medicine" (Sprint 44): the app's own product search (GET
/// /products/search, the home search box's provider) with Add on each match.
/// Medicines already on the order or already added are left out — change their
/// quantity instead. The server checks everything again on save.
class AddMedicineSearch extends ConsumerStatefulWidget {
  final Set<String> exclude;
  final String pincode;
  final bool enabled;
  final ValueChanged<Map<String, dynamic>> onAdd;

  const AddMedicineSearch({super.key, required this.exclude, required this.onAdd, this.pincode = '', this.enabled = true});

  @override
  ConsumerState<AddMedicineSearch> createState() => _AddMedicineSearchState();
}

class _AddMedicineSearchState extends ConsumerState<AddMedicineSearch> {
  final _ctrl = TextEditingController();
  Timer? _debounce;
  String _query = '';

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    super.dispose();
  }

  void _changed(String v) {
    _debounce?.cancel();
    _debounce = Timer(kTypeaheadDebounce, () {
      if (mounted) setState(() => _query = v.trim());
    });
  }

  @override
  Widget build(BuildContext context) {
    final grey = TextStyle(fontSize: 12, color: Colors.grey.shade600);
    final searching = _query.length >= kTypeaheadMinChars;
    final async = searching ? ref.watch(typeaheadProvider(typeaheadKey(_query, pincode: widget.pincode))) : null;
    final results = (async?.valueOrNull?.products ?? const <Map<String, dynamic>>[])
        .where((p) => !widget.exclude.contains(p['id']?.toString()))
        .toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          key: const ValueKey('edit-add-search'),
          controller: _ctrl,
          enabled: widget.enabled,
          onChanged: _changed,
          textInputAction: TextInputAction.search,
          decoration: const InputDecoration(
            labelText: 'Add a medicine',
            hintText: 'Search medicines, e.g. cetirizine',
            prefixIcon: Icon(Icons.search),
          ),
        ),
        if (async != null && async.isLoading)
          Padding(padding: const EdgeInsets.only(top: 6), child: Text('Searching…', style: grey)),
        if (async != null && async.hasError)
          Padding(padding: const EdgeInsets.only(top: 6), child: Text('Could not search right now. Try again.', style: grey)),
        if (async != null && async.hasValue && results.isEmpty)
          Padding(padding: const EdgeInsets.only(top: 6), child: Text('No medicine found to add.', style: grey)),
        for (final p in results)
          _Result(
            product: p,
            onAdd: widget.enabled
                ? () {
                    widget.onAdd(p);
                    _ctrl.clear();
                    setState(() => _query = '');
                  }
                : null,
          ),
      ],
    );
  }
}

class _Result extends StatelessWidget {
  final Map<String, dynamic> product;
  final VoidCallback? onAdd;
  const _Result({required this.product, this.onAdd});

  @override
  Widget build(BuildContext context) {
    final name = product['name']?.toString() ?? '';
    final inStock = product['in_stock'] == true;
    final rx = kRxSchedules.contains(product['drug_schedule']?.toString());
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13.5, fontWeight: FontWeight.w600)),
            Text(
              '${formatPrice(EditAddition(product, 1).unitPaise)}${rx ? ' · prescription needed' : ''}${inStock ? '' : ' · out of stock'}',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ]),
        ),
        OutlinedButton.icon(
          key: ValueKey('edit-add-${product['id']}'),
          onPressed: inStock ? onAdd : null,
          icon: const Icon(Icons.add, size: 16),
          label: Text('Add', semanticsLabel: 'Add $name'),
        ),
      ]),
    );
  }
}
