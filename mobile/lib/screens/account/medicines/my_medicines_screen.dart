import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../models/reminder.dart';
import '../../../providers/reminder_provider.dart';
import '../../../services/api_service.dart';
import '../../../services/reminder_api.dart';
import '../../../widgets/error_retry_view.dart';
import 'reminder_form_sheet.dart';
import 'reminder_tile.dart';

/// "My medicines" (Sprint 33): dose reminders kept on the server. After each
/// change the phone's alerts are set again from the server's list; Taken /
/// Skipped go straight to the server (adherence).
class MyMedicinesScreen extends ConsumerWidget {
  const MyMedicinesScreen({super.key});

  Future<void> _run(BuildContext context, WidgetRef ref, Future<void> Function() action, {String? done}) async {
    try {
      await action();
      if (done != null && context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(ApiService.errorMessage(e, fallback: 'Could not save'))));
      }
    }
    ref.invalidate(remindersProvider);
    ref.invalidate(reminderSuggestionsProvider);
    await ref.read(doseAlarmSyncProvider).sync();
  }

  Future<void> _add(BuildContext context, WidgetRef ref, {ReminderSuggestion? from}) async {
    final f = await showReminderForm(context, medicineName: from?.medicineName);
    if (f == null || !context.mounted) return;
    await _run(context, ref, () => apiService.createReminder(
          medicineName: f.medicineName, dose: f.dose, times: f.times, productId: from?.productId, orderId: from?.orderId),
        done: 'Reminder saved');
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reminders = ref.watch(remindersProvider);
    final suggestions = ref.watch(reminderSuggestionsProvider).valueOrNull ?? const <ReminderSuggestion>[];
    return Scaffold(
      appBar: AppBar(title: const Text('My medicines')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _add(context, ref),
        icon: const Icon(Icons.alarm_add),
        label: const Text('Add a reminder'),
      ),
      body: reminders.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load your reminders'),
          onRetry: () => ref.invalidate(remindersProvider),
        ),
        data: (list) => MyMedicinesBody(
          reminders: list,
          suggestions: suggestions,
          now: DateTime.now().toUtc(),
          onAddFrom: (s) => _add(context, ref, from: s),
          onDose: (r, d, status) => _run(context, ref, () => apiService.logDose(r.id, d.scheduledFor, status)),
          onToggle: (r) => _run(context, ref, () => apiService.updateReminder(r.id, {'is_active': !r.isActive})),
          onEdit: (r) async {
            final f = await showReminderForm(context, medicineName: r.medicineName, dose: r.dose, times: r.times);
            if (f == null || !context.mounted) return;
            await _run(context, ref, () => apiService.updateReminder(r.id, {'medicine_name': f.medicineName, 'dose': f.dose, 'times': f.times}));
          },
          onDelete: (r) => _run(context, ref, () => apiService.deleteReminder(r.id), done: 'Reminder deleted'),
        ),
      ),
    );
  }
}

/// The screen's content, from server data only (also used by the widget tests).
class MyMedicinesBody extends StatelessWidget {
  final List<Reminder> reminders;
  final List<ReminderSuggestion> suggestions;
  final DateTime now;
  final void Function(ReminderSuggestion s) onAddFrom;
  final void Function(Reminder r, DoseToday d, String status) onDose;
  final void Function(Reminder r) onToggle;
  final void Function(Reminder r) onEdit;
  final void Function(Reminder r) onDelete;

  const MyMedicinesBody({
    super.key,
    required this.reminders,
    required this.suggestions,
    required this.now,
    required this.onAddFrom,
    required this.onDose,
    required this.onToggle,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      children: [
        Text(
          'Set the times you take each medicine. You get a reminder on this phone; mark each dose Taken or Skipped. '
          'Reminders do not change your orders or prescriptions — follow your doctor’s advice.',
          style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
        ),
        const SizedBox(height: 12),
        if (suggestions.isNotEmpty) ...[
          const Text('From your past orders', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          for (final s in suggestions)
            ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              title: Text(s.medicineName),
              subtitle: Text('Order ${s.orderNumber}'),
              trailing: OutlinedButton(onPressed: () => onAddFrom(s), child: const Text('Set reminder')),
            ),
          const SizedBox(height: 8),
        ],
        if (reminders.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 24),
            child: Text('No reminders yet. Add one, or pick a medicine from your past orders.', textAlign: TextAlign.center),
          ),
        for (final r in reminders)
          ReminderTile(
            reminder: r,
            now: now,
            onDose: (d, status) => onDose(r, d, status),
            onToggle: () => onToggle(r),
            onEdit: () => onEdit(r),
            onDelete: () => onDelete(r),
          ),
      ],
    );
  }
}
