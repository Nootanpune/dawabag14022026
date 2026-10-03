import '../models/app_notification.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// The buyer's notification inbox, read from the server each time (C-41).
extension NotificationInboxApi on ApiService {
  /// GET /notifications/my → { notifications (latest 30), unread_count }
  Future<NotificationInbox> getNotificationInbox() async {
    final res = await dio.get('/notifications/my');
    return NotificationInbox.fromJson(apiData(res));
  }

  /// PATCH /users/me/notifications/:id/read
  Future<void> markNotificationRead(String id) async {
    await dio.patch('/users/me/notifications/${Uri.encodeComponent(id)}/read');
  }

  /// PATCH /notifications/my/read-all
  Future<void> markAllNotificationsRead() async {
    await dio.patch('/notifications/my/read-all');
  }
}
