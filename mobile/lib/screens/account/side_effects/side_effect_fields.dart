import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// Dropdown over a code → label map. With [optional] a "Not sure" entry
/// (null) is offered; otherwise [requiredMessage] makes a choice mandatory.
class CodeDropdown extends StatelessWidget {
  final String label;
  final Map<String, String> options;
  final String? value;
  final bool enabled;
  final bool optional;
  final String? requiredMessage;
  final ValueChanged<String?> onChanged;

  const CodeDropdown({
    super.key,
    required this.label,
    required this.options,
    required this.value,
    required this.onChanged,
    this.enabled = true,
    this.optional = false,
    this.requiredMessage,
  });

  @override
  Widget build(BuildContext context) => DropdownButtonFormField<String?>(
        value: value,
        isExpanded: true,
        decoration: InputDecoration(labelText: label),
        items: [
          if (optional) const DropdownMenuItem<String?>(value: null, child: Text('Not sure / skip')),
          ...options.entries.map((e) => DropdownMenuItem<String?>(value: e.key, child: Text(e.value))),
        ],
        validator: (v) => (!optional && v == null) ? (requiredMessage ?? 'Please choose one') : null,
        onChanged: enabled ? onChanged : null,
      );
}

/// "When did it start?" — a date picker limited to the past year up to
/// today. Sends YYYY-MM-DD; null when not given.
class OnsetDateField extends StatelessWidget {
  final DateTime? value;
  final bool enabled;
  final ValueChanged<DateTime?> onChanged;

  const OnsetDateField({super.key, required this.value, required this.onChanged, this.enabled = true});

  static String? toApi(DateTime? d) => d == null ? null : DateFormat('yyyy-MM-dd').format(d);

  Future<void> _pick(BuildContext context) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: value ?? now,
      firstDate: DateTime(now.year - 1, now.month, now.day),
      lastDate: now,
    );
    if (picked != null) onChanged(picked);
  }

  @override
  Widget build(BuildContext context) {
    final d = value;
    return InkWell(
      onTap: enabled ? () => _pick(context) : null,
      child: InputDecorator(
        decoration: InputDecoration(
          labelText: 'When did it start? (optional)',
          suffixIcon: d == null
              ? const Icon(Icons.calendar_today, size: 18)
              : IconButton(
                  icon: const Icon(Icons.clear, size: 18),
                  onPressed: enabled ? () => onChanged(null) : null,
                ),
        ),
        child: Text(d == null ? 'Choose a date' : DateFormat('d MMM yyyy').format(d)),
      ),
    );
  }
}
