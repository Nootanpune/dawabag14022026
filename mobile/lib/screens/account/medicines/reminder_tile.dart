import 'package:flutter/material.dart';

import '../../../models/reminder.dart';

/// One medicine's reminder: today's doses with Taken / Skipped, last 7 days and actions.
class ReminderTile extends StatelessWidget {
  final Reminder reminder;
  final DateTime now;
  /// Sprint 34: the dose time an alert was about (ISO instant) — that row is
  /// highlighted so it can be marked here when the alert's button could not.
  final String? highlightAt;
  final void Function(DoseToday dose, String status) onDose;
  final VoidCallback onEdit;
  final VoidCallback onToggle;
  final VoidCallback onDelete;

  const ReminderTile({
    super.key,
    required this.reminder,
    required this.now,
    this.highlightAt,
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
    final highlighted = highlightAt != null;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      shape: highlighted
          ? RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: Colors.amber.shade700, width: 2))
          : null,
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
              for (final d in r.today) _DoseRow(dose: d, due: _due(d), highlighted: _sameInstant(d.scheduledFor, highlightAt), onDose: onDose),
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

  static bool _sameInstant(String a, String? b) {
    if (b == null) return false;
    final x = DateTime.tryParse(a);
    final y = DateTime.tryParse(b);
    return x != null && y != null && x.isAtSameMomentAs(y);
  }

  /// The server takes an answer up to 12 hours before the dose.
  bool _due(DoseToday d) {
    final at = DateTime.tryParse(d.scheduledFor);
    return at != null && !at.isAfter(now.add(const Duration(hours: 12)));
  }
}

/// The app theme makes outlined buttons full width; in a row they size to their text.
final ButtonStyle _rowButton = OutlinedButton.styleFrom(visualDensity: VisualDensity.compact, minimumSize: const Size(64, 36));

class _DoseRow extends StatelessWidget {
  final DoseToday dose;
  final bool due;
  final bool highlighted;
  final void Function(DoseToday dose, String status) onDose;
  const _DoseRow({required this.dose, required this.due, required this.onDose, this.highlighted = false});

  @override
  Widget build(BuildContext context) {
    final status = dose.status;
    return Container(
      key: highlighted ? const ValueKey('highlighted-dose') : null,
      margin: const EdgeInsets.only(top: 6),
      padding: highlighted ? const EdgeInsets.symmetric(horizontal: 6, vertical: 4) : EdgeInsets.zero,
      decoration: highlighted ? BoxDecoration(color: Colors.amber.shade50, borderRadius: BorderRadius.circular(8)) : null,
      // Wraps on a small phone or with large text instead of overflowing (Sprint 34)
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        SizedBox(width: 80, child: Text(clockLabel(dose.time), style: const TextStyle(fontWeight: FontWeight.w600))),
        if (status != null)
          Text(status == 'taken' ? 'Taken' : 'Skipped',
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: status == 'taken' ? Colors.green.shade700 : Colors.amber.shade800)),
        const SizedBox(width: 6),
        Expanded(
          child: due
              ? Wrap(alignment: WrapAlignment.end, spacing: 6, runSpacing: 4, children: [
                  OutlinedButton(style: _rowButton, onPressed: () => onDose(dose, 'taken'), child: const Text('Taken')),
                  OutlinedButton(style: _rowButton, onPressed: () => onDose(dose, 'skipped'), child: const Text('Skipped')),
                ])
              : const SizedBox.shrink(),
        ),
      ]),
    );
  }
}
