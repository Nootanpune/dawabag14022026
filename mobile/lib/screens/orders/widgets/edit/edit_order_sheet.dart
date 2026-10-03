import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../models/json_utils.dart';
import '../../../../models/order_edit.dart';
import '../../../../providers/order_detail_provider.dart';
import '../../../../providers/orders_provider.dart';
import '../../../../services/api_service.dart';
import '../../../../services/order_edit_api.dart';
import 'edit_quantity_row.dart';

/// Opens "Change this order" for [order] (GET /orders/:id shape).
Future<void> showEditOrderSheet(BuildContext context, Map<String, dynamic> order) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => EditOrderSheet(order: order),
    );

/// Lower quantities or remove lines before packing (Sprint 43, URS-074). Only
/// lowering here: to get more, the buyer places a new order. The server checks
/// every rule, issues the credit note (C-30, C-31) and the refund (C-37).
class EditOrderSheet extends StatefulWidget {
  final Map<String, dynamic> order;
  const EditOrderSheet({super.key, required this.order});

  @override
  State<EditOrderSheet> createState() => _EditOrderSheetState();
}

class _EditOrderSheetState extends State<EditOrderSheet> {
  late final List<Map<String, dynamic>> _lines = editableLines(widget.order);
  late final Map<String, int> _qty = {for (final l in _lines) asString(l['id']) ?? '': supplyQty(l)};
  bool _saving = false;
  String? _error;

  String get _orderId => asString(widget.order['id']) ?? '';
  List<Map<String, dynamic>> get _changes => editRequestLines(_lines, _qty);
  int get _left => _qty.values.fold(0, (s, n) => s + n);

  void _set(String id, int n) => setState(() {
        _qty[id] = n;
        _error = null;
      });

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    // Taken before the call: the sheet is gone by the time the order is reloaded
    final messenger = ScaffoldMessenger.maybeOf(context);
    final container = ProviderScope.containerOf(context, listen: false);
    void reload() {
      // The order (and the list's item count) come back from the server either way
      container.invalidate(orderDetailProvider(_orderId));
      container.invalidate(ordersProvider);
    }

    try {
      final result = await apiService.editOrder(_orderId, _changes);
      reload();
      if (!mounted) return;
      Navigator.of(context).pop();
      messenger?.showSnackBar(SnackBar(content: Text(asString(result['message']) ?? 'Your order is changed.')));
    } catch (e) {
      reload();
      // The server's own sentence: increase, not editable, would empty, minimum, ...
      if (mounted) {
        setState(() {
          _saving = false;
          _error = ApiService.errorMessage(e, fallback: 'Could not change the order');
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final grey = TextStyle(fontSize: 12, color: Colors.grey.shade600);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Change this order', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
            const SizedBox(height: 6),
            Text('Lower a quantity or remove a medicine. To add something, place a new order.',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            const SizedBox(height: 8),
            for (final l in _lines)
              EditQuantityRow(
                key: ValueKey('edit-line-${asString(l['id'])}'),
                name: asString(l['product_name']) ?? '',
                was: supplyQty(l),
                quantity: _qty[asString(l['id']) ?? ''] ?? 0,
                enabled: !_saving,
                onChanged: (n) => _set(asString(l['id']) ?? '', n),
              ),
            if (_left == 0) ...[
              const SizedBox(height: 4),
              const Text('To remove everything, cancel the order instead.',
                  key: ValueKey('edit-would-empty'), style: TextStyle(fontSize: 13, color: Colors.red)),
            ],
            const SizedBox(height: 8),
            Text(
              'The invoice stays as issued; what you take off gets a credit note and the money for it comes back the way you paid. '
              "If your payment is only held for the pharmacist's check, the held amount is taken after the check and the "
              'difference is refunded at once. The delivery charge does not change.',
              style: grey,
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, key: const ValueKey('edit-error'), style: const TextStyle(fontSize: 13, color: Colors.red)),
            ],
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(onPressed: _saving ? null : () => Navigator.of(context).pop(), child: const Text('Back')),
                const SizedBox(width: 8),
                ElevatedButton(
                  key: const ValueKey('edit-save'),
                  onPressed: _changes.isEmpty || _left == 0 || _saving ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                      : const Text('Save changes'),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
