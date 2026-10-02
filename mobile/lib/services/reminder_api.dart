import '../models/reminder.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// "My medicines" dose reminders (Sprint 33) — the schedule lives on the server.
extension ReminderApi on ApiService {
  Future<List<Reminder>> getReminders() async => Reminder.listFrom((await dio.get('/reminders')).data['data']);

  /// The coming doses the phone alerts are set from.
  Future<List<UpcomingDose>> getUpcomingDoses({int hours = 72}) async =>
      UpcomingDose.listFrom((await dio.get('/reminders/upcoming', queryParameters: {'hours': hours})).data['data']);

  Future<List<ReminderSuggestion>> getReminderSuggestions() async =>
      apiDataList(await dio.get('/reminders/suggestions')).map(ReminderSuggestion.fromJson).toList();

  Future<void> createReminder({
    required String medicineName,
    String? dose,
    required List<String> times,
    String? endDate,
    String? productId,
    String? orderId,
  }) async {
    await dio.post('/reminders', data: {
      'medicine_name': medicineName,
      if (dose != null && dose.isNotEmpty) 'dose': dose,
      'times': times,
      if (endDate != null && endDate.isNotEmpty) 'end_date': endDate,
      if (productId != null) 'product_id': productId,
      if (orderId != null) 'order_id': orderId,
    });
  }

  Future<void> updateReminder(String id, Map<String, dynamic> changes) async => dio.patch('/reminders/$id', data: changes);

  Future<void> deleteReminder(String id) async => dio.delete('/reminders/$id');

  /// Taken / Skipped for one dose (one answer per dose; a later tap replaces it).
  Future<void> logDose(String id, String scheduledFor, String status) async =>
      dio.post('/reminders/$id/doses', data: {'scheduled_for': scheduledFor, 'status': status});
}
