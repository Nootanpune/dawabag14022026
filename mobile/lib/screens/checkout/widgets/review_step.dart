import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/checkout_summary.dart';
import 'review_charges_card.dart';
import 'review_shipment_card.dart';
import 'rx_policy_note.dart';

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
  /// The prescription chosen for this order, e.g. "photo uploaded 02 Oct 2026, 9:56 am" (C-08)
  final String? rxLabel;
  /// Back to the prescription step (only before the order is placed)
  final VoidCallback? onChangeRx;

  const ReviewStep({
    super.key,
    required this.summary,
    required this.isPractitioner,
    required this.declared,
    required this.onDeclared,
    required this.orderPlaced,
    this.rxLabel,
    this.onChangeRx,
  });

  @override
  Widget build(BuildContext context) {
    final s = summary;
    if (s == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 60),
        child: Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
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
        if (rxLabel != null) ...[
          RxAttachedNote(label: rxLabel!, onChange: orderPlaced ? null : onChangeRx),
          const SizedBox(height: 8),
          const RxPolicyNote(),
          const SizedBox(height: 12),
        ],
        ReviewChargesCard(summary: s),
        if (isPractitioner) ...[
          const SizedBox(height: 8),
          Card(
            child: CheckboxListTile(
              value: declared,
              onChanged: orderPlaced ? null : (v) => onDeclared(v ?? false),
              controlAffinity: ListTileControlAffinity.leading,
              activeColor: AppTheme.brandTeal,
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
