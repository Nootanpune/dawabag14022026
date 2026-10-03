import 'package:flutter/material.dart';

import '../../../../models/json_utils.dart';
import 'edit_order_sheet.dart';

/// "Need less?" with "Change order" while the server says `can_edit` (until
/// packing starts, Sprint 43, URS-074). When it cannot be changed the
/// server's `edit_block_reason` is shown instead, if it sent one.
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
        child: Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 12,
          runSpacing: 8,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('Need less?', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                const SizedBox(height: 2),
                Text('Until we start packing you can lower a quantity or remove a medicine.',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
              ],
            ),
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
