import 'package:flutter/material.dart';

import '../../config/theme.dart';
import '../../services/payment_api.dart';

const _icons = {
  'upi': Icons.phone_android,
  'card': Icons.credit_card,
  'netbanking': Icons.account_balance,
  'wallet': Icons.account_balance_wallet_outlined,
};

/// The ways to pay as tiles; tapping one opens that method's own step
/// (as in Razorpay's window) — nothing is paid yet.
class PaymentMethodTiles extends StatelessWidget {
  final List<String> methods;
  final ValueChanged<String> onSelect;
  const PaymentMethodTiles({super.key, required this.methods, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (final m in methods)
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Semantics(
              button: true,
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => onSelect(m),
                child: Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    border: Border.all(color: Colors.grey.shade300),
                    borderRadius: BorderRadius.circular(10),
                    color: Colors.white,
                  ),
                  child: Row(children: [
                    Icon(_icons[m] ?? Icons.payment, size: 22, color: AppTheme.brandTeal700),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(paymentMethodLabels[m]?.$1 ?? m, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                        Text(paymentMethodLabels[m]?.$2 ?? '', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                      ]),
                    ),
                    Icon(Icons.chevron_right, color: Colors.grey.shade500),
                  ]),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
