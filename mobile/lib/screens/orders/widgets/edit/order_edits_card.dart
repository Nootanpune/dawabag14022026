import 'package:flutter/material.dart';

import '../../../../models/order_edit.dart';
import '../../../../utils/formatters.dart';
import '../../../../utils/ist.dart';

/// "Changes you made" before packing (Sprint 43, URS-074): what changed and
/// the money back (C-37), worded as on the website. Hidden when there are none.
class OrderEditsCard extends StatelessWidget {
  final Map<String, dynamic> order;
  const OrderEditsCard({super.key, required this.order});

  static bool showsFor(Map<String, dynamic> order) => OrderEdit.listFrom(order['edits']).isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final edits = OrderEdit.listFrom(order['edits']);
    if (edits.isEmpty) return const SizedBox.shrink();
    final grey = TextStyle(fontSize: 11, color: Colors.grey.shade600);
    return Card(
      key: const ValueKey('order-edits-card'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Changes you made', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 6),
            for (final e in edits)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (e.editedAt != null) Text(formatDateTimeIst(e.editedAt, zone: true), style: grey),
                    for (final l in e.lines) Text(l.text, style: const TextStyle(fontSize: 13)),
                    if (e.refundPaise > 0)
                      Padding(
                        padding: const EdgeInsets.only(top: 2),
                        child: Text('${formatPrice(e.refundPaise)} ${e.refundWords}'.trim(),
                            style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
