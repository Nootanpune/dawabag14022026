import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/reminder.dart';
import '../services/api_service.dart';
import '../services/dose_alarms.dart';
import '../services/reminder_api.dart';
import 'auth_provider.dart';

/// "My medicines" (Sprint 33): the server's list, fetched on demand.
final remindersProvider = FutureProvider.autoDispose<List<Reminder>>((ref) => apiService.getReminders());
final reminderSuggestionsProvider = FutureProvider.autoDispose<List<ReminderSuggestion>>((ref) => apiService.getReminderSuggestions());

/// Where the phone alerts are set; tests override it with a fake.
/// (The plugin set-up and permission request live in LocalNotifications, Sprint 34.)
final doseAlarmSchedulerProvider = Provider<DoseAlarmScheduler>((ref) => LocalNotificationDoseScheduler());

/// Re-creates the phone alerts from the server's coming doses. Called on start,
/// sign-in and after every change in My medicines; signing out clears them.
class DoseAlarmSync {
  final Ref ref;
  DoseAlarmSync(this.ref);

  Future<void> sync() async {
    try {
      final scheduler = ref.read(doseAlarmSchedulerProvider);
      final signedIn = ref.read(authProvider).isAuthenticated;
      final doses = signedIn ? await apiService.getUpcomingDoses(hours: 72) : const <UpcomingDose>[];
      await scheduler.replaceAll(planDoseAlarms(doses, DateTime.now().toUtc()));
    } catch (_) {
      // Alerts are a convenience; My medicines still shows every dose from the server.
    }
  }
}

final doseAlarmSyncProvider = Provider<DoseAlarmSync>((ref) {
  final sync = DoseAlarmSync(ref);
  ref.listen<bool>(authProvider.select((s) => s.isAuthenticated), (_, __) => sync.sync(), fireImmediately: true);
  return sync;
});
