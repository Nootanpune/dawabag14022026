import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../services/payment_api.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/payments/demo_payment_notice.dart';
import '../../../widgets/payments/payment_method_tiles.dart';
import '../../../widgets/summary_row.dart';
import 'rx_policy_note.dart';

/// Shows the server-computed order total (incl. GST and delivery), the
/// prescription sent with the order (C-08) and how this server takes payment:
/// Razorpay's sheet, the trial's demo payment (no money moves), or a plain
/// "not available" note (Sprint 26).
class PaymentStep extends StatelessWidget {
  final String orderNumber;
  final int totalPaise;
  final PaymentOptions? options;
  final String demoMethod;
  final ValueChanged<String> onDemoMethod;
  final VoidCallback? onSimulateFailure;
  /// e.g. "photo uploaded 02 Oct 2026, 9:56 am"; null when no prescription is needed
  final String? prescriptionLabel;
  final String? notice;

  const PaymentStep({
    super.key,
    required this.orderNumber,
    required this.totalPaise,
    this.options,
    this.demoMethod = 'upi',
    required this.onDemoMethod,
    this.onSimulateFailure,
    this.prescriptionLabel,
    this.notice,
  });

  @override
  Widget build(BuildContext context) {
    final o = options;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                SummaryRow('Order', orderNumber),
                const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Divider()),
                SummaryRow('Total payable', formatPrice(totalPaise),
                    bold: true, valueColor: AppTheme.brandGreen600),
                const SizedBox(height: 6),
                Text('Includes all taxes (GST) and delivery. No cash on delivery.',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
              ],
            ),
          ),
        ),
        if (prescriptionLabel != null) ...[
          const SizedBox(height: 12),
          RxAttachedNote(label: prescriptionLabel!),
          const SizedBox(height: 8),
          const RxPolicyNote(),
        ],
        if (notice != null) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(10)),
            child: Text(notice!, style: TextStyle(fontSize: 13, color: Colors.red.shade900)),
          ),
        ],
        const SizedBox(height: 16),
        if (o == null)
          const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen))
        else if (o.isDemo) ...[
          const DemoPaymentNotice(),
          const SizedBox(height: 12),
          PaymentMethodTiles(methods: o.methods, selected: demoMethod, onSelect: onDemoMethod),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: onSimulateFailure,
            icon: const Icon(Icons.cancel_outlined),
            label: const Text('Simulate failure'),
          ),
        ] else if (o.isRazorpay)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: const Color(0xFFE6F1FB), borderRadius: BorderRadius.circular(10)),
            child: const Row(children: [
              Icon(Icons.lock, color: Color(0xFF185FA5), size: 18),
              SizedBox(width: 10),
              Expanded(
                child: Text('Tap Pay to open Razorpay’s secure window: UPI, debit or credit card, netbanking or a wallet.',
                    style: TextStyle(fontSize: 12, color: Color(0xFF0C447C))),
              ),
            ]),
          )
        else
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(color: AppTheme.amberBadge, borderRadius: BorderRadius.circular(10)),
            child: Text('Online payment is not available right now. Your order $orderNumber is saved; please try again later.',
                style: const TextStyle(fontSize: 13, color: AppTheme.amberText)),
          ),
      ],
    );
  }
}
