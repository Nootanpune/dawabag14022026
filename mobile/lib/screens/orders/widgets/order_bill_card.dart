import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/json_utils.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/summary_row.dart';

/// Bill summary from the server's order totals.
class OrderBillCard extends StatelessWidget {
  final Map<String, dynamic> order;
  const OrderBillCard({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final discount = asInt(order['discount_paise']);
    final gst = asInt(order['gst_paise']);
    final wallet = asInt(order['wallet_used_paise']);
    final method = asString(order['payment_method']);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Bill summary', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 10),
            SummaryRow('Subtotal', formatPrice(asInt(order['subtotal_paise']))),
            if (gst > 0) ...[
              const SizedBox(height: 6),
              SummaryRow('GST', formatPrice(gst)),
            ],
            const SizedBox(height: 6),
            SummaryRow('Shipping', formatPrice(asInt(order['shipping_paise']))),
            if (discount > 0) ...[
              const SizedBox(height: 6),
              SummaryRow('Discount', '–${formatPrice(discount)}', valueColor: Colors.green),
            ],
            if (wallet > 0) ...[
              const SizedBox(height: 6),
              SummaryRow('Wallet', '–${formatPrice(wallet)}', valueColor: Colors.green),
            ],
            const Padding(padding: EdgeInsets.symmetric(vertical: 10), child: Divider()),
            SummaryRow('Total', formatPrice(asInt(order['total_paise'])),
                bold: true, valueColor: AppTheme.brandGreen600),
            if (method != null && method.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text('Paid via $method', style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
            ],
          ],
        ),
      ),
    );
  }
}
