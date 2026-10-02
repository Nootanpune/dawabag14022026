import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../models/reminder.dart';

/// Phone alerts for "My medicines" (Sprint 33).
///
/// The schedule lives ONLY on the server (standing rule): on start, sign-in and
/// after every change the app asks GET /reminders/upcoming and re-creates its
/// alerts from that list; nothing about reminders is kept by the app itself.
/// The alert text never names the medicine (it shows on the lock screen,
/// C-41) — the tap opens My medicines, where Taken / Skipped go to the server.

/// Our alerts use a fixed id range so they can be replaced without remembering
/// anything on the phone.
const int kDoseAlarmBaseId = 700000;
const int kMaxDoseAlarms = 60;
const String kDosePayloadPrefix = 'dose:';
const String kDoseChannelId = 'dawabag_doses';

class DoseAlarm {
  final int id;
  final DateTime at;
  final String title;
  final String body;
  final String payload;
  const DoseAlarm({required this.id, required this.at, required this.title, required this.body, required this.payload});
}

/// Alerts to set for the coming doses: future ones only, soonest first, at most
/// [kMaxDoseAlarms], doses at the same minute merged into one alert.
List<DoseAlarm> planDoseAlarms(List<UpcomingDose> doses, DateTime now) {
  final future = doses.where((d) => d.at.isAfter(now)).toList()..sort((a, b) => a.at.compareTo(b.at));
  final byMinute = <int, List<UpcomingDose>>{};
  for (final d in future) {
    byMinute.putIfAbsent(d.at.millisecondsSinceEpoch ~/ 60000, () => []).add(d);
  }
  final keys = byMinute.keys.toList()..sort();
  final out = <DoseAlarm>[];
  for (final k in keys.take(kMaxDoseAlarms)) {
    final group = byMinute[k]!;
    out.add(DoseAlarm(
      id: kDoseAlarmBaseId + out.length,
      at: group.first.at,
      title: 'Time for your medicine',
      body: group.length == 1 ? 'Tap to mark this dose as taken or skipped.' : 'Tap to mark these ${group.length} doses as taken or skipped.',
      payload: '$kDosePayloadPrefix${group.first.reminderId}@${group.first.at.toUtc().toIso8601String()}',
    ));
  }
  return out;
}

bool isDosePayload(String? payload) => payload != null && payload.startsWith(kDosePayloadPrefix);

/// Where the phone's alerts are set (the plugin in the app; a fake in tests).
abstract class DoseAlarmScheduler {
  Future<void> replaceAll(List<DoseAlarm> alarms);
}

class LocalNotificationDoseScheduler implements DoseAlarmScheduler {
  final FlutterLocalNotificationsPlugin plugin;
  LocalNotificationDoseScheduler(this.plugin);

  static bool _tzReady = false;

  @override
  Future<void> replaceAll(List<DoseAlarm> alarms) async {
    if (!_tzReady) {
      tzdata.initializeTimeZones();
      _tzReady = true;
    }
    final india = tz.getLocation('Asia/Kolkata');
    for (var i = 0; i < kMaxDoseAlarms; i++) {
      await plugin.cancel(kDoseAlarmBaseId + i);
    }
    const details = NotificationDetails(
      android: AndroidNotificationDetails(kDoseChannelId, 'Medicine reminders',
          channelDescription: 'Reminders you set in My medicines',
          importance: Importance.high, priority: Priority.high, visibility: NotificationVisibility.private),
      iOS: DarwinNotificationDetails(),
    );
    for (final a in alarms) {
      await plugin.zonedSchedule(a.id, a.title, a.body, tz.TZDateTime.from(a.at, india), details,
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
          uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
          payload: a.payload);
    }
  }
}
