import 'package:flutter/material.dart';

import '../../../models/reminder.dart';

/// What the reminder form returns.
class ReminderFormResult {
  final String medicineName;
  final String dose;
  final List<String> times;
  const ReminderFormResult(this.medicineName, this.dose, this.times);
}

/// Medicine, dose and up to 6 times a day (India time). Returns null when cancelled.
Future<ReminderFormResult?> showReminderForm(BuildContext context, {String? medicineName, String? dose, List<String>? times}) {
  return showModalBottomSheet<ReminderFormResult>(
    context: context,
    isScrollControlled: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: ReminderForm(medicineName: medicineName, dose: dose, times: times),
    ),
  );
}

class ReminderForm extends StatefulWidget {
  final String? medicineName;
  final String? dose;
  final List<String>? times;
  const ReminderForm({super.key, this.medicineName, this.dose, this.times});

  @override
  State<ReminderForm> createState() => _ReminderFormState();
}

class _ReminderFormState extends State<ReminderForm> {
  late final _name = TextEditingController(text: widget.medicineName ?? '');
  late final _dose = TextEditingController(text: widget.dose ?? '');
  late List<String> _times = [...(widget.times ?? const ['08:00'])]..sort();

  @override
  void dispose() {
    _name.dispose();
    _dose.dispose();
    super.dispose();
  }

  void _add(String t) {
    if (_times.contains(t) || _times.length >= 6) return;
    setState(() => _times = [..._times, t]..sort());
  }

  Future<void> _pick() async {
    final t = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 9, minute: 0));
    if (t != null) _add('${t.hour.toString().padLeft(2, '0')}:${t.minute.toString().padLeft(2, '0')}');
  }

  @override
  Widget build(BuildContext context) {
    final canSave = _name.text.trim().length >= 2 && _times.isNotEmpty;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Reminder', style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            TextField(controller: _name, decoration: const InputDecoration(labelText: 'Medicine'), onChanged: (_) => setState(() {})),
            TextField(controller: _dose, decoration: const InputDecoration(labelText: 'Dose (optional), e.g. 1 tablet')),
            const SizedBox(height: 12),
            const Text('Times (India time)', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            Wrap(spacing: 6, runSpacing: 4, children: [
              for (final t in _times)
                InputChip(label: Text(clockLabel(t)), onDeleted: () => setState(() => _times = _times.where((x) => x != t).toList())),
              for (final t in kQuickTimes.where((t) => !_times.contains(t)))
                ActionChip(label: Text('+ ${clockLabel(t)}'), onPressed: () => _add(t)),
              ActionChip(avatar: const Icon(Icons.schedule, size: 16), label: const Text('Other time'), onPressed: _pick),
            ]),
            const SizedBox(height: 12),
            Row(mainAxisAlignment: MainAxisAlignment.end, children: [
              TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
              const SizedBox(width: 8),
              FilledButton(
                onPressed: canSave ? () => Navigator.pop(context, ReminderFormResult(_name.text.trim(), _dose.text.trim(), _times)) : null,
                child: const Text('Save reminder'),
              ),
            ]),
          ],
        ),
      ),
    );
  }
}
