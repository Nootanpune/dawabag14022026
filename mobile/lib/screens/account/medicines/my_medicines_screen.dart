import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../models/reminder.dart';
import '../../../providers/reminder_provider.dart';
import '../../../services/api_service.dart';
import '../../../services/dose_actions.dart';
import '../../../services/reminder_api.dart';
import '../../../widgets/error_retry_view.dart';
import 'reminder_form_sheet.dart';
import 'reminder_tile.dart';

/// "My medicines" (Sprint 33): dose reminders kept on the server. After each
/// change the phone's alerts are set again from the server's list; Taken /
/// Skipped go straight to the server (adherence).
class MyMedicinesScreen extends ConsumerWidget {
  /// The dose from a tapped alert (Sprint 34), shown highlighted
  final DoseRef? highlight;
  const MyMedicinesScreen({super.key, this.highlight});

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
          highlight: highlight,
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
class MyMedicinesBody extends StatefulWidget {
  final List<Reminder> reminders;
  final List<ReminderSuggestion> suggestions;
  final DateTime now;
  /// Sprint 34: the dose an alert was about — highlighted and scrolled to
  final DoseRef? highlight;
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
    this.highlight,
    required this.onAddFrom,
    required this.onDose,
    required this.onToggle,
    required this.onEdit,
    required this.onDelete,
  });

  @override
  State<MyMedicinesBody> createState() => _MyMedicinesBodyState();
}

class _MyMedicinesBodyState extends State<MyMedicinesBody> {
  final _highlightKey = GlobalKey();
  bool _scrolled = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToHighlight());
  }

  void _scrollToHighlight() {
    final ctx = _highlightKey.currentContext;
    if (_scrolled || ctx == null || !mounted) return;
    _scrolled = true;
    Scrollable.ensureVisible(ctx, alignment: 0.2, duration: const Duration(milliseconds: 300));
  }

  bool _isHighlighted(Reminder r) => widget.highlight?.reminderIds.contains(r.id) ?? false;

  @override
  Widget build(BuildContext context) {
    final reminders = widget.reminders;
    final suggestions = widget.suggestions;
    final scrollTo = reminders.where(_isHighlighted).firstOrNull;
    // A plain scroll view (a person has a handful of reminders) so the dose
    // from an alert is built and can be scrolled to (Sprint 34)
    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 96),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text(
          'Set the times you take each medicine. You get a reminder on this phone; mark each dose Taken or Skipped. '
          'Reminders do not change your orders or prescriptions — follow your doctor’s advice.',
          style: TextStyle(fontSize: 13, color: Colors.grey.shade700),
        ),
        const SizedBox(height: 12),
        if (scrollTo != null) ...[
          Text('Mark the dose from your reminder below (highlighted).',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Colors.amber.shade900)),
          const SizedBox(height: 8),
        ],
        if (suggestions.isNotEmpty) ...[
          const Text('From your past orders', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
          for (final s in suggestions)
            ListTile(
              contentPadding: EdgeInsets.zero,
              dense: true,
              title: Text(s.medicineName),
              subtitle: Text('Order ${s.orderNumber}'),
              trailing: OutlinedButton(
                // sized to its text (the app theme's outlined buttons are full width)
                style: OutlinedButton.styleFrom(minimumSize: const Size(64, 36)),
                onPressed: () => widget.onAddFrom(s),
                child: const Text('Set reminder'),
              ),
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
            // the first highlighted reminder is the one scrolled to
            key: identical(r, scrollTo) ? _highlightKey : null,
            reminder: r,
            now: widget.now,
            highlightAt: _isHighlighted(r) ? widget.highlight!.scheduledFor : null,
            onDose: (d, status) => widget.onDose(r, d, status),
            onToggle: () => widget.onToggle(r),
            onEdit: () => widget.onEdit(r),
            onDelete: () => widget.onDelete(r),
          ),
      ]),
    );
  }
}
