import 'package:flutter/material.dart';

import '../../../../models/json_utils.dart';
import 'edit_order_sheet.dart';

/// "Need to change something?" with "Change order" while the server says
/// `can_edit` (Sprint 44: until our pharmacist approves the order and the
/// invoice is issued). When it cannot be changed the server's
/// `edit_block_reason` is shown instead, if it sent one.
class EditOrderCard extends StatelessWidget {
  final Map<String, dynamic> order;
  const EditOrderCard({super.key, required this.order});

  /// Something to show: the action, or the reason it is not available.
  static bool showsFor(Map<String, dynamic> order) =>
      asBool(order['can_edit']) || (asString(order['edit_block_reason'])?.trim().isNotEmpty ?? false);

  @override
  Widget build(BuildContext context) {
    if (!asBool(order['can_edit'])) {
      final reason = asString(order['edit_block_reason'])?.trim() ?? '';
      if (reason.isEmpty) return const SizedBox.shrink();
      return Card(
        key: const ValueKey('order-edit-blocked'),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, size: 18, color: Colors.grey.shade600),
              const SizedBox(width: 8),
              Expanded(child: Text(reason, style: TextStyle(fontSize: 12, color: Colors.grey.shade700))),
            ],
          ),
        ),
      );
    }
    return Card(
      key: const ValueKey('order-edit-card'),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Need to change something?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 2),
            Text('Until our pharmacist approves the order you can change quantities, remove or add medicines.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: () => showEditOrderSheet(context, order),
              icon: const Icon(Icons.edit_outlined, size: 18),
              label: const Text('Change order'),
            ),
          ],
        ),
      ),
    );
  }
}
