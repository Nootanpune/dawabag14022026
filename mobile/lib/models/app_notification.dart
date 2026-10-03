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
  /// Sprint 39: order_cancelled for an order whose payment was only held —
  /// the hold is released and the buyer was not charged (C-37)
  final bool notCharged;

  const AppNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.body,
    this.isRead = false,
    this.sentAt,
    this.orderId,
    this.notCharged = false,
  });

  /// The text to show: the server's, plus "not charged" when it did not say so.
  String get displayBody {
    if (!notCharged || body.toLowerCase().contains('not been charged') || body.toLowerCase().contains('not charged')) {
      return body;
    }
    return body.isEmpty ? 'You have not been charged.' : '$body — you have not been charged';
  }

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
      notCharged: asBool(data['notCharged'] ?? data['not_charged']),
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
