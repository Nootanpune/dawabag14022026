import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../models/json_utils.dart';
import '../../../../models/order_edit.dart';
import '../../../../models/practitioner.dart';
import '../../../../providers/order_detail_provider.dart';
import '../../../../providers/orders_provider.dart';
import '../../../../providers/practitioner_provider.dart';
import '../../../../services/api_service.dart';
import '../../../../services/api_utils.dart';
import '../../../../services/order_edit_api.dart';
import '../../../../services/prescription_api.dart';
import '../../../../widgets/practitioner/written_order_picker.dart';
import 'add_medicine_search.dart';
import 'added_medicine_row.dart';
import 'edit_quantity_row.dart';
import 'edit_rx_picker.dart';

/// Opens "Change this order" for [order] (GET /orders/:id shape).
Future<void> showEditOrderSheet(BuildContext context, Map<String, dynamic> order) => showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (_) => EditOrderSheet(order: order),
    );

/// Change the order before our pharmacist approves it and the tax invoice is
/// issued (Sprint 44, owner decision 2026-10-03; replaces Sprint 43's
/// lower-only sheet): lower, remove or raise quantities and add medicines by
/// search. A prescription medicine added or raised needs a valid prescription
/// (C-08); a doctor / institution signs a written order for what is added
/// (Drugs Rules r.65(9)(b)). The server re-prices the order and settles the
/// difference: a refund, the credit bill, or a second payment (shown on the
/// order page). Everything chosen here is held in memory until saved.
class EditOrderSheet extends ConsumerStatefulWidget {
  final Map<String, dynamic> order;
  const EditOrderSheet({super.key, required this.order});

  @override
  ConsumerState<EditOrderSheet> createState() => _EditOrderSheetState();
}

class _EditOrderSheetState extends ConsumerState<EditOrderSheet> {
  late final List<Map<String, dynamic>> _lines = editableLines(widget.order);
  late final Map<String, int> _qty = {for (final l in _lines) asString(l['id']) ?? '': supplyQty(l)};
  final List<EditAddition> _adds = [];
  String? _rxId;
  String? _writtenOrderId;
  bool _rxAsked = false; // the server asked for a prescription we did not expect
  bool _saving = false;
  String? _error;
  String? _writtenError;

  String get _orderId => asString(widget.order['id']) ?? '';
  String? get _pricingType => asString(widget.order['pricing_type']);
  bool get _trade => kTradePricingTypes.contains(_pricingType);
  bool get _practitioner => _pricingType == kPractitionerType;

  List<Map<String, dynamic>> get _changes => editRequestLines(_lines, _qty);
  int get _left => _qty.values.fold(0, (s, n) => s + n) + _adds.fold(0, (s, a) => s + a.quantity);
  List<Map<String, dynamic>> get _raised => _lines.where((l) => (_qty[asString(l['id'])] ?? 0) > supplyQty(l)).toList();

  /// Prescription medicines being added or raised (the server decides; this only asks early).
  List<String> get _rxNames => [
        for (final l in _raised)
          if (kRxSchedules.contains(asString(l['drug_schedule']))) asString(l['product_name']) ?? '',
        for (final a in _adds)
          if (a.needsRx) a.name,
      ];
  bool get _needsRx => (!_trade && _rxNames.isNotEmpty) || _rxAsked;

  /// What a written order must cover: raised lines at their new total, and additions.
  List<Map<String, dynamic>> get _more => [
        for (final l in _raised) {'product_id': asString(l['product_id']), 'quantity': _qty[asString(l['id'])]},
        for (final a in _adds) a.toJson(),
      ];
  bool get _needsWritten => _practitioner && _more.isNotEmpty;

  bool get _blocked =>
      (_changes.isEmpty && _adds.isEmpty) ||
      _left == 0 ||
      (_needsRx && _rxId == null) ||
      (_needsWritten && _writtenOrderId == null) ||
      _saving;

  void _edit(VoidCallback change) => setState(() {
        change();
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
      container.invalidate(orderDetailProvider(_orderId));
      container.invalidate(ordersProvider);
    }

    try {
      final result = await apiService.editOrder(
        _orderId,
        lines: _changes,
        add: [for (final a in _adds) a.toJson()],
        prescriptionId: _needsRx ? _rxId : null,
        writtenOrderId: _needsWritten ? _writtenOrderId : null,
      );
      reload();
      if (!mounted) return;
      Navigator.of(context).pop();
      messenger?.showSnackBar(SnackBar(
        content: Text(asString(result['message']) ?? 'Your order is changed.'),
        duration: const Duration(seconds: 6),
      ));
    } catch (e) {
      reload();
      if (!mounted) return;
      final message = ApiService.errorMessage(e, fallback: 'Could not change the order');
      setState(() {
        _saving = false;
        if (isPrescriptionRequired(e)) _rxAsked = true; // show the prescription picker
        if (isWrittenOrderProblem(e)) {
          // Required / not covering / too old / already used: sign or upload another
          _writtenOrderId = null;
          _writtenError = message;
          ref.invalidate(myWrittenOrdersProvider);
        }
        if (isPractitionerRegistrationInvalid(e)) ref.invalidate(practitionerRegistrationProvider);
        // The server's own sentence: not editable, already on the order, credit limit, …
        _error = message;
      });
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
            Text('Until our pharmacist approves the order you can lower, remove or raise a quantity, or add a medicine.',
                style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
            const SizedBox(height: 8),
            for (final l in _lines)
              EditQuantityRow(
                key: ValueKey('edit-line-${asString(l['id'])}'),
                name: asString(l['product_name']) ?? '',
                was: supplyQty(l),
                quantity: _qty[asString(l['id']) ?? ''] ?? 0,
                enabled: !_saving,
                onChanged: (n) => _edit(() => _qty[asString(l['id']) ?? ''] = n),
              ),
            for (var i = 0; i < _adds.length; i++)
              AddedMedicineRow(
                key: ValueKey('edit-added-${_adds[i].productId}'),
                addition: _adds[i],
                enabled: !_saving,
                onQuantity: (n) => _edit(() => _adds[i] = _adds[i].withQuantity(n)),
                onRemove: () => _edit(() => _adds.removeAt(i)),
              ),
            const SizedBox(height: 8),
            AddMedicineSearch(
              exclude: {for (final l in _lines) asString(l['product_id']) ?? '', for (final a in _adds) a.productId},
              pincode: asString(widget.order['pincode']) ?? '',
              enabled: !_saving,
              onAdd: (p) => _edit(() => _adds.add(EditAddition(p, 1))),
            ),
            if (_needsRx) ...[
              const SizedBox(height: 12),
              EditRxPicker(
                orderId: _orderId,
                names: _rxNames.isEmpty ? const ['the medicines you added'] : _rxNames,
                value: _rxId,
                onChanged: (id) => _edit(() => _rxId = id),
                loadLink: apiService.prescriptionLink,
              ),
            ],
            if (_needsWritten) ...[
              const SizedBox(height: 12),
              WrittenOrderPicker(
                items: _more,
                value: _writtenOrderId,
                error: _writtenError,
                onChanged: (id) => _edit(() {
                  _writtenOrderId = id;
                  if (id != null) _writtenError = null;
                }),
              ),
            ],
            if (_left == 0) ...[
              const SizedBox(height: 4),
              const Text('To remove everything, cancel the order instead.',
                  key: ValueKey('edit-would-empty'), style: TextStyle(fontSize: 13, color: Colors.red)),
            ],
            const SizedBox(height: 8),
            Text(
              'No invoice has been issued yet, so the order is simply re-priced. If it costs less, the difference comes back '
              "the way you paid (if your payment is only held for the pharmacist's check, the held amount is taken after the "
              'check and the difference refunded at once). If it costs more, you pay the difference before our pharmacist '
              'approves the order. The delivery charge does not change.',
              style: grey,
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Semantics(
                liveRegion: true,
                child: Text(_error!, key: const ValueKey('edit-error'), style: const TextStyle(fontSize: 13, color: Colors.red)),
              ),
            ],
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                TextButton(onPressed: _saving ? null : () => Navigator.of(context).pop(), child: const Text('Back')),
                const SizedBox(width: 8),
                ElevatedButton(
                  key: const ValueKey('edit-save'),
                  onPressed: _blocked ? null : _save,
                  child: _saving
                      ? const SizedBox(
                          width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
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
