import 'json_utils.dart';

/// "My medicines" dose reminder (Sprint 33). The schedule and the Taken /
/// Skipped answers live on the server; the app only shows them and sets phone
/// alerts from GET /reminders/upcoming.
class Reminder {
  final String id;
  final String medicineName;
  final String? dose;
  final List<String> times;
  final String startDate;
  final String? endDate;
  final bool isActive;
  final bool fromOrder;
  final List<DoseToday> today;
  final int taken7;
  final int skipped7;
  final int missed7;

  const Reminder({
    required this.id,
    required this.medicineName,
    this.dose,
    required this.times,
    required this.startDate,
    this.endDate,
    this.isActive = true,
    this.fromOrder = false,
    this.today = const [],
    this.taken7 = 0,
    this.skipped7 = 0,
    this.missed7 = 0,
  });

  factory Reminder.fromJson(Map<String, dynamic> j) {
    final week = asMap(j['last_7_days']);
    return Reminder(
      id: asString(j['id']) ?? '',
      medicineName: asString(j['medicine_name']) ?? '',
      dose: asString(j['dose']),
      times: (j['times'] is List ? (j['times'] as List).map((e) => e.toString()).toList() : const <String>[]),
      startDate: asString(j['start_date']) ?? '',
      endDate: asString(j['end_date']),
      isActive: j['is_active'] != false,
      fromOrder: j['source'] == 'order',
      today: asMapList(j['today']).map(DoseToday.fromJson).toList(),
      taken7: asInt(week['taken']),
      skipped7: asInt(week['skipped']),
      missed7: asInt(week['missed']),
    );
  }

  static List<Reminder> listFrom(Object? data) => asMapList(data).map(Reminder.fromJson).toList();
}

class DoseToday {
  final String time;
  final String scheduledFor;
  final String? status;
  const DoseToday({required this.time, required this.scheduledFor, this.status});

  factory DoseToday.fromJson(Map<String, dynamic> j) =>
      DoseToday(time: asString(j['time']) ?? '', scheduledFor: asString(j['scheduled_for']) ?? '', status: asString(j['status']));
}

/// A coming dose, from GET /reminders/upcoming (what the phone alerts are set from).
class UpcomingDose {
  final String reminderId;
  final String medicineName;
  final DateTime at;
  const UpcomingDose({required this.reminderId, required this.medicineName, required this.at});

  static List<UpcomingDose> listFrom(Object? data) => asMapList(data)
      .map((j) => (j, DateTime.tryParse(asString(j['scheduled_for']) ?? '')))
      .where((x) => x.$2 != null)
      .map((x) => UpcomingDose(reminderId: asString(x.$1['reminder_id']) ?? '', medicineName: asString(x.$1['medicine_name']) ?? '', at: x.$2!.toUtc()))
      .toList();
}

/// A medicine from a delivered order that has no reminder yet.
class ReminderSuggestion {
  final String productId;
  final String medicineName;
  final String orderId;
  final String orderNumber;
  const ReminderSuggestion({required this.productId, required this.medicineName, required this.orderId, required this.orderNumber});

  factory ReminderSuggestion.fromJson(Map<String, dynamic> j) => ReminderSuggestion(
        productId: asString(j['product_id']) ?? '',
        medicineName: asString(j['medicine_name']) ?? '',
        orderId: asString(j['order_id']) ?? '',
        orderNumber: asString(j['order_number']) ?? '',
      );
}

/// "08:00" → "8:00 am" (Indian times).
String clockLabel(String hhmm) {
  final parts = hhmm.split(':');
  if (parts.length != 2) return hhmm;
  final h = int.tryParse(parts[0]) ?? 0;
  final m = parts[1].padLeft(2, '0');
  final h12 = h % 12 == 0 ? 12 : h % 12;
  return '$h12:$m ${h >= 12 ? 'pm' : 'am'}';
}

/// One-tap times on the reminder form.
const List<String> kQuickTimes = ['08:00', '13:00', '20:00', '22:00'];
