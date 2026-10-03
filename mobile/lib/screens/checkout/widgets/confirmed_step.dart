import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../orders/widgets/order_shipments_card.dart';
import '../../../utils/formatters.dart';
import '../../../utils/payment_hold.dart';
import 'rx_policy_note.dart';

class ConfirmedStep extends StatelessWidget {
  final String orderNumber;

  /// `shipments` from the POST /orders response (seller + invoice per
  /// shipment); empty when the API sent none.
  final List<Map<String, dynamic>> shipments;

  /// Paid with the trial's demo payment (no money moved)
  final bool demo;

  /// How the demo payment was made, e.g. "Card ending 1111 (demo)"
  final String? paidBy;

  /// Sprint 34 (as the web): the prescription sent with the order, e.g.
  /// "photo uploaded 02 Oct 2026, 9:56 am"; null when none was needed (C-08)
  final String? prescriptionLabel;

  /// Sprint 39 (C-37): the payment came back authorised — the amount is held,
  /// not charged, until our pharmacist checks the prescription
  final bool authorised;
  final int totalPaise;
  final String? chargeNote;

  const ConfirmedStep({
    super.key,
    required this.orderNumber,
    this.shipments = const [],
    this.demo = false,
    this.paidBy,
    this.prescriptionLabel,
    this.authorised = false,
    this.totalPaise = 0,
    this.chargeNote,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 40),
        Container(
          width: 72,
          height: 72,
          decoration: BoxDecoration(color: Colors.green.shade50, shape: BoxShape.circle),
          child: const Icon(Icons.check_circle, color: Colors.green, size: 40),
        ),
        const SizedBox(height: 20),
        Text(
            authorised
                ? 'Order placed — payment authorised'
                : prescriptionLabel != null
                    ? 'Order placed and paid'
                    : 'Order confirmed!',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        if (authorised) ...[
          Text('Amount held: ${formatPrice(totalPaise)} — not charged yet',
              key: const ValueKey('confirmed-amount-held'),
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          ChargeAfterCheckNote(
            note: '${chargeNoteOr(chargeNote)} The amount stays held on your card or UPI until then. '
                'If your order cannot be supplied, the hold is released and you are not charged.',
          ),
          const SizedBox(height: 8),
        ],
        if (paidBy != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text('${authorised ? 'Authorised with' : 'Paid by'}: $paidBy', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
          ),
        if (demo)
          Container(
            margin: const EdgeInsets.only(bottom: 8),
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: const Color(0xFFFFF8E6), borderRadius: BorderRadius.circular(20)),
            child: const Text('Demo payment — no money moved', style: TextStyle(fontSize: 12, color: Color(0xFF7A4B00))),
          ),
        Text('Order ID: $orderNumber',
            style: TextStyle(fontSize: 14, color: Colors.grey.shade500)),
        // Sprint 34: repeat the prescription line, as the web's confirmation (C-08)
        if (prescriptionLabel != null) ...[
          const SizedBox(height: 12),
          RxAttachedNote(label: prescriptionLabel!),
          const SizedBox(height: 8),
          Text(
            'Next: our pharmacist checks your prescription. We pack and dispatch your order once it is accepted, '
            'and tell you at each step.',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade800),
          ),
        ],
        const SizedBox(height: 8),
        Text("You'll receive SMS and email updates at every step.",
            style: TextStyle(fontSize: 13, color: Colors.grey.shade400),
            textAlign: TextAlign.center),
        if (shipments.isNotEmpty) ...[
          const SizedBox(height: 20),
          SizedBox(width: double.infinity, child: OrderShipmentsCard(shipments: shipments)),
        ],
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: () => context.go('/orders'),
          child: const Text('Track my order'),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () => context.go('/'),
          child: const Text('Continue shopping'),
        ),
      ],
    );
  }
}
