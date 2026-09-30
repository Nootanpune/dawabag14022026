import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/summary_row.dart';

/// Shows the server-computed order total (incl. GST and delivery).
class PaymentStep extends StatelessWidget {
  final String orderNumber;
  final int totalPaise;

  const PaymentStep({super.key, required this.orderNumber, required this.totalPaise});

  @override
  Widget build(BuildContext context) {
    return Column(
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
                Text('Incl. all taxes (GST) and delivery',
                    style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFE6F1FB),
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Row(
            children: [
              Icon(Icons.lock, color: Color(0xFF185FA5), size: 18),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Secure payment via Razorpay — UPI, credit/debit cards, net banking & wallets. No cash on delivery.',
                  style: TextStyle(fontSize: 12, color: Color(0xFF0C447C)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
