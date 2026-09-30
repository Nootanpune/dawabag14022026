import 'package:flutter/material.dart';

/// One delivered line with a − / + quantity stepper (0..[maxQuantity]).
/// The server re-checks how many units can still be returned.
class ReturnItemPicker extends StatelessWidget {
  final String name;
  final int maxQuantity;
  final int quantity;
  final bool enabled;
  final ValueChanged<int> onChanged;

  const ReturnItemPicker({
    super.key,
    required this.name,
    required this.maxQuantity,
    required this.quantity,
    required this.enabled,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) => Card(
        margin: const EdgeInsets.only(bottom: 8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                    Text('Delivered: $maxQuantity',
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                  ],
                ),
              ),
              IconButton(
                icon: const Icon(Icons.remove_circle_outline),
                onPressed: enabled && quantity > 0 ? () => onChanged(quantity - 1) : null,
              ),
              Text('$quantity', style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
              IconButton(
                icon: const Icon(Icons.add_circle_outline),
                onPressed: enabled && quantity < maxQuantity ? () => onChanged(quantity + 1) : null,
              ),
            ],
          ),
        ),
      );
}
