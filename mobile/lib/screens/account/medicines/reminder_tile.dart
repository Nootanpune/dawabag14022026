import 'package:flutter/material.dart';

import '../../../models/reminder.dart';

/// One medicine's reminder: today's doses with Taken / Skipped, last 7 days and actions.
class ReminderTile extends StatelessWidget {
  final Reminder reminder;
  final DateTime now;
  final void Function(DoseToday dose, String status) onDose;
  final VoidCallback onEdit;
  final VoidCallback onToggle;
  final VoidCallback onDelete;

  const ReminderTile({
    super.key,
    required this.reminder,
    required this.now,
    required this.onDose,
    required this.onEdit,
    required this.onToggle,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final r = reminder;
    final subtitle = [r.dose, r.times.map(clockLabel).join(', '), if (r.fromOrder) 'from your order']
        .whereType<String>().where((s) => s.isNotEmpty).join(' · ');
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Expanded(child: Text(r.medicineName, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
              if (!r.isActive) const Chip(label: Text('Paused'), visualDensity: VisualDensity.compact),
            ]),
            Text(subtitle, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            if (r.isActive)
              for (final d in r.today) _DoseRow(dose: d, due: _due(d), onDose: onDose),
            if (r.taken7 + r.skipped7 + r.missed7 > 0)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text('Last 7 days: ${r.taken7} taken, ${r.skipped7} skipped, ${r.missed7} not answered',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
              ),
            Wrap(spacing: 4, children: [
              TextButton.icon(onPressed: onToggle, icon: Icon(r.isActive ? Icons.pause : Icons.play_arrow, size: 16), label: Text(r.isActive ? 'Pause' : 'Resume')),
              TextButton.icon(onPressed: onEdit, icon: const Icon(Icons.edit_outlined, size: 16), label: const Text('Edit')),
              TextButton.icon(
                onPressed: onDelete,
                icon: const Icon(Icons.delete_outline, size: 16, color: Colors.red),
                label: const Text('Delete', style: TextStyle(color: Colors.red)),
              ),
            ]),
          ],
        ),
      ),
    );
  }

  /// The server takes an answer up to 12 hours before the dose.
  bool _due(DoseToday d) {
    final at = DateTime.tryParse(d.scheduledFor);
    return at != null && !at.isAfter(now.add(const Duration(hours: 12)));
  }
}

class _DoseRow extends StatelessWidget {
  final DoseToday dose;
  final bool due;
  final void Function(DoseToday dose, String status) onDose;
  const _DoseRow({required this.dose, required this.due, required this.onDose});

  @override
  Widget build(BuildContext context) {
    final status = dose.status;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: Row(children: [
        SizedBox(width: 72, child: Text(clockLabel(dose.time), style: const TextStyle(fontWeight: FontWeight.w600))),
        if (status != null)
          Text(status == 'taken' ? 'Taken' : 'Skipped',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: status == 'taken' ? Colors.green.shade700 : Colors.amber.shade800)),
        const Spacer(),
        if (due) ...[
          OutlinedButton(
            style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
            onPressed: () => onDose(dose, 'taken'),
            child: const Text('Taken'),
          ),
          const SizedBox(width: 6),
          OutlinedButton(
            style: OutlinedButton.styleFrom(visualDensity: VisualDensity.compact),
            onPressed: () => onDose(dose, 'skipped'),
            child: const Text('Skipped'),
          ),
        ],
      ]),
    );
  }
}
