import 'package:flutter/material.dart';

import '../../../widgets/practitioner/registration_status_card.dart';
import '../../../widgets/practitioner/written_order_picker.dart';

/// Checkout step for a doctor / medical institution (Sprint 44; Drugs Rules
/// 1945 r.65(9)(b); FDA Maharashtra circular Drug/Wholesalers Memo./16/2026/1):
/// the registration as Dawabag verified it, and the signed written order for
/// this cart — reused, signed here or uploaded — before the order is placed
/// (POST /orders refuses it without `written_order_id`).
class WrittenOrderStep extends StatelessWidget {
  /// The cart lines: [{product_id, quantity}]
  final List<Map<String, dynamic>> items;
  final String? value;
  final ValueChanged<String?> onChanged;
  final String? error;
  final bool orderPlaced;

  const WrittenOrderStep({
    super.key,
    required this.items,
    required this.value,
    required this.onChanged,
    this.error,
    this.orderPlaced = false,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const Text('Written order', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text('Sign the requisition for this order in the app, upload your signed requisition, or use one you made recently.',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
        const SizedBox(height: 12),
        const RegistrationStatusCard(compact: true),
        const SizedBox(height: 12),
        if (orderPlaced)
          Text('Your order has been placed with its written order. Continue to payment.',
              style: TextStyle(fontSize: 13, color: Colors.grey.shade700))
        else
          WrittenOrderPicker(items: items, value: value, onChanged: onChanged, error: error),
      ],
    );
  }
}
