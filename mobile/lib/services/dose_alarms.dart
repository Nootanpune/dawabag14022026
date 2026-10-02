import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:timezone/data/latest_all.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

import '../models/reminder.dart';
import 'dose_actions.dart';
import 'local_notifications.dart';

export 'dose_actions.dart' show isDosePayload, kDosePayloadPrefix;

/// Phone alerts for "My medicines" (Sprint 33).
///
/// The schedule lives ONLY on the server (standing rule): on start, sign-in and
/// after every change the app asks GET /reminders/upcoming and re-creates its
/// alerts from that list; nothing about reminders is kept by the app itself.
/// The alert text never names the medicine (it shows on the lock screen,
/// C-41). Sprint 34: the alert has "Taken" and "Skip", which send the answer to
/// the server without opening the app (dose_action_background.dart); the tap
/// opens My medicines on that dose. After a phone restart the notification
/// plugin sets its own stored alerts again (boot receiver in the manifest) and
/// the app re-syncs from the server when it next starts.

/// Our alerts use a fixed id range so they can be replaced without remembering
/// anything on the phone.
const int kDoseAlarmBaseId = 700000;
const int kMaxDoseAlarms = 60;

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
      body: group.length == 1 ? 'Mark this dose as taken or skipped.' : 'Mark these ${group.length} doses as taken or skipped.',
      // ids only — never the medicine's name (C-41); every reminder due at that minute
      payload: dosePayload(group.map((d) => d.reminderId).toSet().toList(), group.first.at),
    ));
  }
  return out;
}

/// Where the phone's alerts are set (the plugin in the app; a fake in tests).
abstract class DoseAlarmScheduler {
  Future<void> replaceAll(List<DoseAlarm> alarms);
}

/// Android: "Taken" / "Skip" run in the background (showsUserInterface false)
/// and close the alert. iOS: the same buttons come from [kDoseCategoryId].
const NotificationDetails kDoseNotificationDetails = NotificationDetails(
  android: AndroidNotificationDetails(kDoseChannelId, kDoseChannelName,
      channelDescription: kDoseChannelDescription,
      importance: Importance.high,
      priority: Priority.high,
      visibility: NotificationVisibility.private,
      actions: <AndroidNotificationAction>[
        AndroidNotificationAction(kDoseActionTaken, 'Taken', cancelNotification: true),
        AndroidNotificationAction(kDoseActionSkip, 'Skip', cancelNotification: true),
      ]),
  iOS: DarwinNotificationDetails(categoryIdentifier: kDoseCategoryId),
);

class LocalNotificationDoseScheduler implements DoseAlarmScheduler {
  FlutterLocalNotificationsPlugin get plugin => LocalNotifications.plugin;

  static bool _tzReady = false;

  @override
  Future<void> replaceAll(List<DoseAlarm> alarms) async {
    if (!_tzReady) {
      tzdata.initializeTimeZones();
      _tzReady = true;
    }
    await LocalNotifications.ensureInitialized();
    // Ask for permission only when there is something to alert about
    if (alarms.isNotEmpty) await LocalNotifications.requestPermission();
    final india = tz.getLocation('Asia/Kolkata');
    for (var i = 0; i < kMaxDoseAlarms; i++) {
      await plugin.cancel(kDoseAlarmBaseId + i);
    }
    for (final a in alarms) {
      await plugin.zonedSchedule(a.id, a.title, a.body, tz.TZDateTime.from(a.at, india), kDoseNotificationDetails,
          androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
          uiLocalNotificationDateInterpretation: UILocalNotificationDateInterpretation.absoluteTime,
          payload: a.payload);
    }
  }
}
