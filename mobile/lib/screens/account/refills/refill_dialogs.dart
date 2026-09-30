import 'package:flutter/material.dart';

import '../../../models/refill.dart';

/// Refill frequency limits (Sprint 3 contract, section D: 7–180 days).
const int kMinRefillDays = 7;
const int kMaxRefillDays = 180;

/// Yes/no confirmation. Returns true only when the user confirms.
Future<bool> confirmRefillAction(
  BuildContext context, {
  required String title,
  required String message,
  required String confirmLabel,
  bool destructive = false,
}) async {
  final ok = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep')),
        TextButton(
          onPressed: () => Navigator.pop(ctx, true),
          child: Text(confirmLabel, style: TextStyle(color: destructive ? Colors.red : null)),
        ),
      ],
    ),
  );
  return ok == true;
}

/// Asks for a new frequency (7–180 days). Returns null when cancelled.
Future<int?> askRefillFrequency(BuildContext context, int current) {
  return showDialog<int>(
    context: context,
    builder: (ctx) => _FrequencyDialog(initial: current),
  );
}

class _FrequencyDialog extends StatefulWidget {
  final int initial;
  const _FrequencyDialog({required this.initial});

  @override
  State<_FrequencyDialog> createState() => _FrequencyDialogState();
}

class _FrequencyDialogState extends State<_FrequencyDialog> {
  late final TextEditingController _controller =
      TextEditingController(text: widget.initial.toString());
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final days = int.tryParse(_controller.text.trim());
    if (days == null || days < kMinRefillDays || days > kMaxRefillDays) {
      setState(() => _error = 'Enter $kMinRefillDays to $kMaxRefillDays days');
      return;
    }
    Navigator.pop(context, days);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Refill every…'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Wrap(
              spacing: 8,
              children: [15, 30, 45, 60, 90]
                  .map((d) => ChoiceChip(
                        label: Text('$d days'),
                        selected: _controller.text.trim() == '$d',
                        onSelected: (_) => setState(() {
                          _controller.text = '$d';
                          _error = null;
                        }),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _controller,
              keyboardType: TextInputType.number,
              decoration: InputDecoration(
                labelText: 'Days between refills',
                suffixText: 'days',
                errorText: _error,
              ),
              onChanged: (_) => setState(() => _error = null),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(onPressed: _submit, child: const Text('Save')),
        ],
      );
}

/// Edits item quantities; 0 removes an item. Returns only the changed items
/// (absolute quantities), or null when cancelled / nothing changed.
Future<List<RefillItem>?> editRefillItems(BuildContext context, List<RefillItem> items) {
  return showDialog<List<RefillItem>>(
    context: context,
    builder: (ctx) => _ItemsDialog(items: items),
  );
}

class _ItemsDialog extends StatefulWidget {
  final List<RefillItem> items;
  const _ItemsDialog({required this.items});

  @override
  State<_ItemsDialog> createState() => _ItemsDialogState();
}

class _ItemsDialogState extends State<_ItemsDialog> {
  late final List<int> _qty = widget.items.map((i) => i.quantity).toList();

  void _save() {
    final changed = <RefillItem>[];
    for (var i = 0; i < widget.items.length; i++) {
      final item = widget.items[i];
      if (_qty[i] != item.quantity) {
        changed.add(RefillItem(productId: item.productId, name: item.name, quantity: _qty[i]));
      }
    }
    Navigator.pop(context, changed.isEmpty ? null : changed);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Edit items'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: widget.items.length,
            itemBuilder: (_, i) => Row(
              children: [
                Expanded(
                  child: Text(
                    widget.items[i].name,
                    style: TextStyle(
                      fontSize: 13,
                      decoration: _qty[i] == 0 ? TextDecoration.lineThrough : null,
                    ),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.remove_circle_outline, size: 20),
                  onPressed: _qty[i] > 0 ? () => setState(() => _qty[i]--) : null,
                ),
                Text('${_qty[i]}', style: const TextStyle(fontWeight: FontWeight.w600)),
                IconButton(
                  icon: const Icon(Icons.add_circle_outline, size: 20),
                  onPressed: _qty[i] < 999 ? () => setState(() => _qty[i]++) : null,
                ),
              ],
            ),
          ),
        ),
        actions: [
          Text('0 removes the item', style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(onPressed: _save, child: const Text('Save')),
        ],
      );
}
