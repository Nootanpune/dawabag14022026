import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/aftercare.dart';
import '../../../models/json_utils.dart';
import '../../../providers/order_detail_provider.dart';
import '../../../services/aftercare_api.dart';
import '../../../services/api_service.dart';
import '../../../widgets/error_retry_view.dart';
import 'return_item_picker.dart';

/// /account/returns/new?orderId=..&shipmentId=.. — "Report a problem" with a
/// delivered shipment (C-37). The shipment's lines come from GET /orders/:id;
/// the server checks the 48 h / 30 day windows and answers 409 with the
/// reason, which is shown as-is.
class NewReturnScreen extends ConsumerStatefulWidget {
  final String orderId;
  final String shipmentId;
  const NewReturnScreen({super.key, required this.orderId, required this.shipmentId});

  @override
  ConsumerState<NewReturnScreen> createState() => _NewReturnScreenState();
}

class _NewReturnScreenState extends ConsumerState<NewReturnScreen> {
  final _formKey = GlobalKey<FormState>();
  final _description = TextEditingController();
  final Map<String, int> _quantities = {};
  String _reason = 'damaged';
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (!_quantities.values.any((q) => q > 0)) {
      setState(() => _error = 'Choose at least one item and quantity');
      return;
    }
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final created = await apiService.createReturn(
        shipmentId: widget.shipmentId,
        reason: _reason,
        description: _description.text.trim(),
        quantities: Map<String, int>.from(_quantities),
      );
      if (!mounted) return;
      ref.invalidate(orderDetailProvider(widget.orderId));
      final no = asString(created['return_no']);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(no != null ? 'Return $no registered' : 'Return registered')),
      );
      final id = asString(created['id']) ?? '';
      if (id.isNotEmpty) {
        context.pushReplacement('/account/returns/$id');
      } else {
        context.pop();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = ApiService.errorMessage(e, fallback: 'Could not register the return');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(orderDetailProvider(widget.orderId));
    return Scaffold(
      appBar: AppBar(title: const Text('Report a problem')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load this order'),
          onRetry: () => ref.invalidate(orderDetailProvider(widget.orderId)),
        ),
        data: (order) => _form(asMapList(order['items'])
            .where((i) => asString(i['shipment_id']) == widget.shipmentId)
            .toList()),
      ),
    );
  }

  Widget _form(List<Map<String, dynamic>> items) => Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            DropdownButtonFormField<String>(
              initialValue: _reason,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'What went wrong?'),
              items: kReturnReasons.entries
                  .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: _submitting ? null : (v) => setState(() => _reason = v ?? _reason),
            ),
            const SizedBox(height: 6),
            Text(
              'Damaged, wrong or missing items: within 48 hours of delivery. Expired, near-expiry '
              'or quality problems: within 30 days. Recalled batches: any time.',
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 16),
            const Text('Which items?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 6),
            if (items.isEmpty)
              Text('No items found for this shipment.', style: TextStyle(color: Colors.grey.shade600))
            else
              ...items.map((item) {
                final itemId = asString(item['id']) ?? '';
                return ReturnItemPicker(
                  name: asString(item['product_name']) ?? '',
                  maxQuantity: asInt(item['quantity']),
                  quantity: _quantities[itemId] ?? 0,
                  enabled: !_submitting && itemId.isNotEmpty,
                  onChanged: (q) => setState(() => _quantities[itemId] = q),
                );
              }),
            const SizedBox(height: 12),
            TextFormField(
              controller: _description,
              enabled: !_submitting,
              maxLength: 2000,
              minLines: 4,
              maxLines: 8,
              decoration: const InputDecoration(
                labelText: 'Describe the problem',
                hintText: 'e.g. the strip was torn and two tablets were crushed',
                alignLabelWithHint: true,
              ),
              validator: (v) => (v?.trim().length ?? 0) < 10 ? 'Enter at least 10 characters' : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _submitting || items.isEmpty ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Submit return request'),
            ),
            const SizedBox(height: 8),
            Text(
              'Keep the pack and its seal. A pharmacist reviews every request; refunds go back '
              'the way you paid, with a credit note from the seller.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
        ),
      );
}
