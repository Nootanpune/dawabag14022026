import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/checkout_summary.dart';
import '../../../models/policy.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/summary_row.dart';

/// Charge break-up, payment terms, returns note and policy links from the
/// server's checkout summary (C-35, C-37, C-39).
class ReviewChargesCard extends StatelessWidget {
  final CheckoutSummary summary;
  const ReviewChargesCard({super.key, required this.summary});

  static String termsLabel(String? terms) => switch (terms) {
        null || 'prepaid' => 'Pay now online',
        'cad' => 'Cash against delivery (trade account)',
        'postpaid' => 'Postpaid (trade account)',
        final String t when t.startsWith('net_') => 'Credit, ${t.substring(4)} days',
        final String t => t,
      };

  @override
  Widget build(BuildContext context) {
    final c = summary.charges;
    final policies = summary.policies;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              children: [
                SummaryRow('Items', formatPrice(c.itemsPaise)),
                const SizedBox(height: 4),
                SummaryRow('GST', formatPrice(c.gstPaise)),
                const SizedBox(height: 4),
                SummaryRow('Delivery', c.deliveryPaise == 0 ? 'Free' : formatPrice(c.deliveryPaise)),
                if (c.discountPaise > 0) ...[
                  const SizedBox(height: 4),
                  SummaryRow('Discount', '–${formatPrice(c.discountPaise)}', valueColor: AppTheme.brandLeafDark),
                ],
                if (c.walletPaise > 0) ...[
                  const SizedBox(height: 4),
                  SummaryRow('Wallet', '–${formatPrice(c.walletPaise)}', valueColor: AppTheme.brandLeafDark),
                ],
                const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider()),
                SummaryRow('Total payable', formatPrice(c.totalPayablePaise),
                    bold: true, valueColor: AppTheme.brandTeal),
                const SizedBox(height: 4),
                SummaryRow('Payment', termsLabel(summary.paymentTerms)),
              ],
            ),
          ),
        ),
        if ((summary.returnsNote ?? '').isNotEmpty) ...[
          const SizedBox(height: 12),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppTheme.amberBadge, borderRadius: BorderRadius.circular(10)),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Icon(Icons.assignment_return_outlined, size: 18, color: AppTheme.amberText),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(summary.returnsNote!,
                      style: const TextStyle(fontSize: 12, color: AppTheme.amberText)),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 8),
        Wrap(
          spacing: 4,
          children: [
            ...(policies.isNotEmpty
                    ? policies
                    : const [
                        PolicyRef(key: 'refund', title: 'Refund and return policy'),
                        PolicyRef(key: 'cancellation', title: 'Cancellation policy'),
                        PolicyRef(key: 'shipping', title: 'Shipping policy'),
                      ])
                .map((p) => TextButton(
                      onPressed: () => context.push('/policies/${p.key}'),
                      style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
                      child: Text(p.title, style: const TextStyle(fontSize: 12)),
                    )),
            TextButton(
              onPressed: () => context.push('/policies/terms'),
              style: TextButton.styleFrom(visualDensity: VisualDensity.compact),
              child: const Text('Terms of use', style: TextStyle(fontSize: 12)),
            ),
          ],
        ),
      ],
    );
  }
}
