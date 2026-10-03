import 'package:flutter/material.dart';

import '../../../../config/theme.dart';
import '../../../../models/order_edit.dart';
import '../../../../utils/formatters.dart';

/// A medicine the buyer is adding to the order (Sprint 44): price each, − qty +
/// (at least 1) and Remove. The server prices and allocates it on save.
class AddedMedicineRow extends StatelessWidget {
  final EditAddition addition;
  final bool enabled;
  final ValueChanged<int> onQuantity;
  final VoidCallback onRemove;
  static const max = 999;

  const AddedMedicineRow({super.key, required this.addition, required this.onQuantity, required this.onRemove, this.enabled = true});

  @override
  Widget build(BuildContext context) {
    final a = addition;
    final n = a.quantity;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Wrap(
        alignment: WrapAlignment.spaceBetween,
        crossAxisAlignment: WrapCrossAlignment.center,
        spacing: 8,
        runSpacing: 6,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 140),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(a.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              Text('Added · ${formatPrice(a.unitPaise)} each${a.needsRx ? ' · prescription needed' : ''}',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            ]),
          ),
          Row(mainAxisSize: MainAxisSize.min, children: [
            Container(
              decoration: BoxDecoration(
                border: Border.all(color: AppTheme.brandTeal, width: 2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                IconButton(
                  tooltip: 'Lower quantity of ${a.name}',
                  color: AppTheme.brandTeal700,
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.remove, size: 18),
                  onPressed: enabled && n > 1 ? () => onQuantity(n - 1) : null,
                ),
                SizedBox(
                  width: 28,
                  child: Text('$n', textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                ),
                IconButton(
                  tooltip: 'Raise quantity of ${a.name}',
                  color: AppTheme.brandTeal700,
                  visualDensity: VisualDensity.compact,
                  icon: const Icon(Icons.add, size: 18),
                  onPressed: enabled && n < max ? () => onQuantity(n + 1) : null,
                ),
              ]),
            ),
            const SizedBox(width: 4),
            TextButton.icon(
              onPressed: enabled ? onRemove : null,
              style: TextButton.styleFrom(foregroundColor: Colors.red.shade700),
              icon: const Icon(Icons.delete_outline, size: 16),
              label: const Text('Remove'),
            ),
          ]),
        ],
      ),
    );
  }
}
