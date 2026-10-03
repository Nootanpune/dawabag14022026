import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/practitioner.dart';
import '../../../services/api_service.dart';
import '../../../services/practitioner_api.dart';
import '../../../utils/ist.dart';
import '../../../widgets/open_pdf_button.dart';

/// A doctor / institution order's signed written order(s) (Sprint 44; Drugs
/// Rules r.65(9)(b)) from the order's `written_orders[]`, each opened through a
/// 5-minute link (GET /written-orders/:id/link) outside the app — nothing saved.
class WrittenOrdersCard extends StatelessWidget {
  final Map<String, dynamic> order;
  const WrittenOrdersCard({super.key, required this.order});

  static bool showsFor(Map<String, dynamic> order) => WrittenOrder.listFrom(order['written_orders']).isNotEmpty;

  @override
  Widget build(BuildContext context) {
    final list = WrittenOrder.listFrom(order['written_orders']);
    if (list.isEmpty) return const SizedBox.shrink();
    return Card(
      key: const ValueKey('written-orders-card'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Row(children: [
              Icon(Icons.assignment_turned_in_outlined, size: 18, color: AppTheme.brandTeal700),
              SizedBox(width: 8),
              Text('Signed written order', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            ]),
            const SizedBox(height: 6),
            for (final w in list)
              Wrap(
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 4,
                children: [
                  Text(
                    '${w.uploaded ? 'Uploaded requisition' : 'Signed in the app'}'
                    '${w.signedAt != null ? ' · ${formatDateTimeIst(w.signedAt, zone: true)}' : ''}'
                    '${w.orderEditId != null ? ' (for a change)' : ''}',
                    style: const TextStyle(fontSize: 13),
                  ),
                  OpenPdfButton(label: 'Open', resolve: () => apiService.writtenOrderUri(w.id)),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
