import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../config/theme.dart';

/// Previous / next day and a date picker for the doctor's consultation list.
class DayBar extends StatelessWidget {
  final DateTime day;
  final DateTime today;
  final ValueChanged<DateTime> onChanged;

  const DayBar({super.key, required this.day, required this.today, required this.onChanged});

  Future<void> _pick(BuildContext context) async {
    final first = DateTime(today.year - 1, today.month, today.day);
    final last = DateTime(today.year + 1, today.month, today.day);
    // The picker asserts that the initial date is inside its range.
    final initial = day.isBefore(first) ? first : (day.isAfter(last) ? last : day);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: first,
      lastDate: last,
    );
    if (picked != null) onChanged(DateTime(picked.year, picked.month, picked.day));
  }

  @override
  Widget build(BuildContext context) {
    final isToday = day == today;
    final label = isToday ? 'Today, ${DateFormat('d MMM yyyy').format(day)}' : DateFormat('EEE, d MMM yyyy').format(day);
    return Row(
      children: [
        IconButton(
          tooltip: 'Previous day',
          icon: const Icon(Icons.chevron_left),
          onPressed: () => onChanged(DateTime(day.year, day.month, day.day - 1)),
        ),
        Expanded(
          child: TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: AppTheme.brandTeal700),
            onPressed: () => _pick(context),
            icon: const Icon(Icons.calendar_today, size: 16),
            label: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ),
        IconButton(
          tooltip: 'Next day',
          icon: const Icon(Icons.chevron_right),
          onPressed: () => onChanged(DateTime(day.year, day.month, day.day + 1)),
        ),
      ],
    );
  }
}
