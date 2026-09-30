import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/checkout_summary.dart';
import 'review_charges_card.dart';
import 'review_shipment_card.dart';

/// Review before placing the order (C-35): one block per seller, the charge
/// break-up, returns note and policy links, all from POST /orders/preview.
/// Doctors / hospitals must tick the practitioner declaration, unticked by
/// default, on every order (C-15).
class ReviewStep extends StatelessWidget {
  final CheckoutSummary? summary;
  final bool isPractitioner;
  final bool declared;
  final ValueChanged<bool> onDeclared;
  final bool orderPlaced;

  const ReviewStep({
    super.key,
    required this.summary,
    required this.isPractitioner,
    required this.declared,
    required this.onDeclared,
    required this.orderPlaced,
  });

  @override
  Widget build(BuildContext context) {
    final s = summary;
    if (s == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 60),
        child: Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (orderPlaced)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text('Your order has been placed. Continue to finish it.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
          ),
        for (var i = 0; i < s.shipments.length; i++)
          ReviewShipmentCard(shipment: s.shipments[i], index: i, count: s.shipments.length),
        ReviewChargesCard(summary: s),
        if (isPractitioner) ...[
          const SizedBox(height: 8),
          Card(
            child: CheckboxListTile(
              value: declared,
              onChanged: orderPlaced ? null : (v) => onDeclared(v ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: AppTheme.brandGreen,
              title: const Text(
                'I confirm these medicines are only for treating or dispensing to my own patients, '
                'are not for resale, and include no Schedule X or narcotic (NDPS) drugs.',
                style: TextStyle(fontSize: 13),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
