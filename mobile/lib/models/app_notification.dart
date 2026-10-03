import 'json_utils.dart';

/// One row of the buyer's notification inbox (GET /notifications/my). The
/// server writes the title and text when it sends the notification; `data` is
/// the payload it was sent with (order id, ticket, return number…). Held in
/// memory only (server is the single source of truth, C-41).
class AppNotification {
  final String id;
  final String type;
  final String title;
  final String body;
  final bool isRead;
  final String? sentAt;
  final String? orderId;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.isRead = false,
    this.sentAt,
    this.orderId,
  });

  factory AppNotification.fromJson(Map<String, dynamic> j) {
    final data = asMap(j['data']);
    final order = (data['orderId'] ?? data['order_id'] ?? j['order_id'])?.toString().trim();
    return AppNotification(
      id: asString(j['id']) ?? '',
      type: asString(j['type']) ?? '',
      title: (asString(j['title']) ?? '').trim(),
      body: (asString(j['body']) ?? '').trim(),
      isRead: asBool(j['is_read']),
      sentAt: asString(j['sent_at']),
      orderId: (order == null || order.isEmpty) ? null : order,
    );
  }
}

/// The inbox: the latest notifications and how many are unread.
class NotificationInbox {
  final List<AppNotification> items;
  final int unread;
  const NotificationInbox(this.items, this.unread);

  /// `{ notifications: [...], unread_count }` (GET /notifications/my).
  factory NotificationInbox.fromJson(Map<String, dynamic> j) {
    final items = asMapList(j['notifications']).map(AppNotification.fromJson).toList();
    final unread = j['unread_count'];
    return NotificationInbox(items, unread == null ? items.where((n) => !n.isRead).length : asInt(unread));
  }
}
