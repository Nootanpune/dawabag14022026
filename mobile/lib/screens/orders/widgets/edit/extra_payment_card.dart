import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../config/theme.dart';
import '../../../../models/json_utils.dart';
import '../../../../models/order_edit.dart';
import '../../../../models/payment_result.dart';
import '../../../../providers/order_detail_provider.dart';
import '../../../../providers/orders_provider.dart';
import '../../../../services/api_service.dart';
import '../../../../services/payment_api.dart';
import '../../../../utils/formatters.dart';
import '../../../../utils/payment_hold.dart';
import '../../../../widgets/payments/demo_checkout/demo_checkout.dart';
import '../../../checkout/checkout_razorpay.dart';

/// "Pay the difference for your change" (Sprint 44): a change that raised the
/// order's value needs a second payment, and our pharmacist approves the order
/// only once it is paid. Paid like the order itself — POST /payments/create-order
/// {order_id, order_edit_id}, Razorpay, POST /payments/verify — or, on the trial
/// server, POST /payments/demo with order_edit_id. An order with prescription
/// medicines is only authorised (held) and charged after the pharmacist's check
/// (Sprint 39, C-08, C-37). Shown from the order's `extra_payment`; the order is
/// reloaded from the server after paying.
class ExtraPaymentCard extends ConsumerStatefulWidget {
  final Map<String, dynamic> order;
  const ExtraPaymentCard({super.key, required this.order});

  static bool showsFor(Map<String, dynamic> order) => ExtraPaymentDue.fromOrder(order) != null;

  @override
  ConsumerState<ExtraPaymentCard> createState() => _ExtraPaymentCardState();
}

class _ExtraPaymentCardState extends ConsumerState<ExtraPaymentCard> {
  PaymentOptions? _options;
  CheckoutRazorpay? _razorpay;
  bool _busy = false;
  String? _notice;

  String get _orderId => asString(widget.order['id']) ?? '';

  /// Held now, charged after the pharmacist's check (prescription medicines on the order).
  bool get _held => asBool(widget.order['requires_prescription']);

  @override
  void initState() {
    super.initState();
    apiService.getPaymentOptions().then((o) {
      if (mounted) setState(() => _options = o);
    });
  }

  @override
  void dispose() {
    _razorpay?.dispose();
    super.dispose();
  }

  void _reload() {
    ref.invalidate(orderDetailProvider(_orderId));
    ref.invalidate(ordersProvider);
  }

  void _paid(PaymentResult r) {
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(
      content: Text(r.authorised
          ? 'The difference is held — ${chargeNoteOr(r.chargeNote)}'
          : 'The difference is paid. Our pharmacist can now approve your order.'),
    ));
    _reload();
  }

  void _payWithRazorpay(ExtraPaymentDue due) {
    setState(() => _notice = null);
    final rp = _razorpay ??= CheckoutRazorpay(
      onPaid: _paid,
      onError: (message, [_]) {
        if (mounted) setState(() => _notice = message);
        _reload();
      },
      onBusy: (busy) {
        if (mounted) setState(() => _busy = busy);
      },
    );
    rp.pay(_orderId,
        orderNumber: '${asString(widget.order['order_number']) ?? ''} — difference', orderEditId: due.orderEditId);
  }

  Future<bool> _payDemo(ExtraPaymentDue due, DemoChoice choice, bool success) async {
    setState(() => _notice = null);
    final result = await apiService.payOrderDemo(_orderId,
        method: choice.method, provider: choice.provider, fail: !success, orderEditId: due.orderEditId);
    if (result.paid) _paid(result);
    return result.paid;
  }

  @override
  Widget build(BuildContext context) {
    final due = ExtraPaymentDue.fromOrder(widget.order);
    if (due == null) return const SizedBox.shrink();
    final o = _options;
    final amount = formatPrice(due.amountPaise);
    return Container(
      key: const ValueKey('extra-payment-card'),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: Colors.amber.shade300, width: 1.5),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text('Pay the difference for your change', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
          const SizedBox(height: 4),
          Text(
            '$amount is due. Our pharmacist approves the order once it is paid.'
            '${_held ? ' The amount is held now and taken only after the pharmacist’s check.' : ''}',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade800),
          ),
          if (_held) ...[
            const SizedBox(height: 6),
            Text('If your order cannot be supplied, the hold is released and you are not charged.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
          ],
          if (_notice != null) ...[
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(8)),
              child: Text(_notice!, style: TextStyle(fontSize: 13, color: Colors.red.shade900)),
            ),
          ],
          const SizedBox(height: 12),
          if (o == null)
            const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)))
          else if (o.isDemo)
            DemoCheckout(
              key: ValueKey('extra-demo-${due.orderEditId}'),
              amountPaise: due.amountPaise,
              methods: o.methods,
              providers: o.providers,
              onPay: (choice, success) => _payDemo(due, choice, success),
            )
          else if (o.isRazorpay)
            ElevatedButton.icon(
              key: const ValueKey('extra-pay'),
              onPressed: _busy ? null : () => _payWithRazorpay(due),
              icon: _busy
                  ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                  : const Icon(Icons.lock, size: 18),
              label: Text('${_held ? 'Authorise' : 'Pay'} $amount securely'),
            )
          else
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: AppTheme.amberBadge, borderRadius: BorderRadius.circular(10)),
              child: const Text('Online payment is not available right now. Your change is saved; please try again later.',
                  style: TextStyle(fontSize: 13, color: AppTheme.amberText)),
            ),
        ],
      ),
    );
  }
}
