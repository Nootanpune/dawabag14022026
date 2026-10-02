import 'package:flutter/material.dart';

import '../../config/theme.dart';
import '../../services/payment_api.dart';

const _icons = {
  'upi': Icons.phone_android,
  'card': Icons.credit_card,
  'netbanking': Icons.account_balance,
  'wallet': Icons.account_balance_wallet_outlined,
};

/// The ways to pay as tiles; one chosen.
class PaymentMethodTiles extends StatelessWidget {
  final List<String> methods;
  final String selected;
  final ValueChanged<String> onSelect;
  const PaymentMethodTiles({super.key, required this.methods, required this.selected, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final m in methods)
          SizedBox(
            width: (MediaQuery.sizeOf(context).width - 32 - 8) / 2,
            child: Semantics(
              selected: m == selected,
              button: true,
              child: InkWell(
                borderRadius: BorderRadius.circular(10),
                onTap: () => onSelect(m),
                child: Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    border: Border.all(color: m == selected ? AppTheme.brandGreen : Colors.grey.shade300, width: m == selected ? 2 : 1),
                    borderRadius: BorderRadius.circular(10),
                    color: m == selected ? AppTheme.brandGreen50 : Colors.white,
                  ),
                  child: Row(children: [
                    Icon(_icons[m] ?? Icons.payment, size: 20, color: m == selected ? AppTheme.brandGreen700 : Colors.grey.shade600),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(paymentMethodLabels[m]?.$1 ?? m, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
                        Text(paymentMethodLabels[m]?.$2 ?? '', style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                      ]),
                    ),
                  ]),
                ),
              ),
            ),
          ),
      ],
    );
  }
}
