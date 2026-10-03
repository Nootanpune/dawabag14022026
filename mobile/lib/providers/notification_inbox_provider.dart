import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/app_notification.dart';
import '../services/api_service.dart';
import '../services/notification_inbox_api.dart';

/// GET /notifications/my, refetched whenever the inbox opens (autoDispose) or
/// is invalidated after marking as read. Never stored on the device.
final notificationInboxProvider = FutureProvider.autoDispose<NotificationInbox>(
  (ref) => apiService.getNotificationInbox(),
);
