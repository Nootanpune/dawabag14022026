import 'package:flutter/material.dart';

import '../../../../config/theme.dart';

/// One line in "Change this order": lower, raise (Sprint 44, up to [max]),
/// Remove / Keep. Same wording as the website (EditOrderDialog).
class EditQuantityRow extends StatelessWidget {
  final String name;

  /// What is to be supplied now (supply_qty).
  final int was;
  /// The most the app offers (the website's 999); the server checks the real limits.
  final int max;
  final int quantity;
  final bool enabled;
  final ValueChanged<int> onChanged;

  const EditQuantityRow({
    super.key,
    required this.name,
    required this.was,
    required this.quantity,
    required this.onChanged,
    this.enabled = true,
    this.max = 999,
  });

  String get _note => quantity == 0 ? 'Will be removed' : quantity != was ? 'Was $was' : 'Ordered $was';

  @override
  Widget build(BuildContext context) {
    final n = quantity;
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
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                Text(_note,
                    style: TextStyle(fontSize: 12, color: n == 0 ? Colors.red.shade700 : Colors.grey.shade600)),
              ],
            ),
          ),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Semantics(
                label: 'Quantity of $name',
                child: Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: AppTheme.brandTeal, width: 2),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      IconButton(
                        tooltip: 'Lower quantity of $name',
                        color: AppTheme.brandTeal700,
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(Icons.remove, size: 18),
                        onPressed: enabled && n > 0 ? () => onChanged(n - 1) : null,
                      ),
                      SizedBox(
                        width: 28,
                        child: Text('$n',
                            textAlign: TextAlign.center,
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                      ),
                      IconButton(
                        tooltip: 'Raise quantity of $name',
                        color: AppTheme.brandTeal700,
                        visualDensity: VisualDensity.compact,
                        icon: const Icon(Icons.add, size: 18),
                        // Sprint 44: more is allowed before the pharmacist's approval (the server checks stock)
                        onPressed: enabled && n < max ? () => onChanged(n + 1) : null,
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 4),
              n > 0
                  ? TextButton(
                      onPressed: enabled ? () => onChanged(0) : null,
                      style: TextButton.styleFrom(foregroundColor: Colors.red.shade700),
                      child: const Text('Remove'),
                    )
                  : TextButton.icon(
                      onPressed: enabled ? () => onChanged(was) : null,
                      icon: const Icon(Icons.undo, size: 16),
                      label: const Text('Keep'),
                    ),
            ],
          ),
        ],
      ),
    );
  }
}
