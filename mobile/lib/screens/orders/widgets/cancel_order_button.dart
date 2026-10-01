import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../models/json_utils.dart';
import '../../../providers/order_detail_provider.dart';
import '../../../services/aftercare_api.dart';
import '../../../services/api_service.dart';
import '../../../utils/formatters.dart';

/// "Cancel order", shown only when the server says `can_cancel` (until
/// packing starts, C-37). POST /orders/:id/cancel { reason }, then the order
/// is reloaded from the server.
class CancelOrderButton extends ConsumerStatefulWidget {
  final String orderId;
  const CancelOrderButton({super.key, required this.orderId});

  @override
  ConsumerState<CancelOrderButton> createState() => _CancelOrderButtonState();
}

class _CancelOrderButtonState extends ConsumerState<CancelOrderButton> {
  bool _busy = false;

  Future<void> _cancel() async {
    final reason = await showDialog<String>(context: context, builder: (_) => const _ReasonDialog());
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    String message;
    bool isError = false;
    try {
      final data = await apiService.cancelOrder(widget.orderId, reason);
      final refund = asInt(data['refund_paise']);
      message = refund > 0
          ? 'Order cancelled. Refund of ${formatPrice(refund)} started.'
          : 'Order cancelled.';
    } catch (e) {
      message = ApiService.errorMessage(e, fallback: 'Could not cancel this order');
      isError = true;
    }
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: isError ? Colors.red : null),
    );
    ref.invalidate(orderDetailProvider(widget.orderId));
  }

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        onPressed: _busy ? null : _cancel,
        style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
        icon: _busy
            ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
            : const Icon(Icons.cancel_outlined, size: 18),
        label: const Text('Cancel order'),
      );
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog();

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _controller = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _controller.text.trim();
    if (text.length < 3) {
      setState(() => _error = 'Please tell us why (at least 3 characters)');
      return;
    }
    Navigator.pop(context, text);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Cancel this order?'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Any amount you paid will be refunded to the way you paid.',
                style: TextStyle(fontSize: 13)),
            const SizedBox(height: 12),
            TextField(
              controller: _controller,
              maxLength: 500,
              minLines: 2,
              maxLines: 4,
              decoration: InputDecoration(hintText: 'Reason for cancelling', errorText: _error),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Keep order')),
          TextButton(
            onPressed: _submit,
            child: const Text('Cancel order', style: TextStyle(color: Colors.red)),
          ),
        ],
      );
}
