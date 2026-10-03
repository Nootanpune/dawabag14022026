import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../models/app_notification.dart';
import '../../providers/notification_inbox_provider.dart';
import '../../services/api_service.dart';
import '../../services/notification_inbox_api.dart';
import '../../utils/notification_kinds.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/error_retry_view.dart';
import 'widgets/notification_tile.dart';

/// /account/notifications — the in-app inbox (Sprint 36). Everything comes from
/// GET /notifications/my and is reloaded on open and pull-to-refresh. A tap
/// marks the row read on the server and opens what it is about (order on hold,
/// dispatched, refund…); staff-only alerts are acted on in the staff website.
class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  Future<void> _open(BuildContext context, WidgetRef ref, AppNotification n) async {
    final path = notificationPath(n.type, orderId: n.orderId);
    final messenger = ScaffoldMessenger.of(context);
    if (path != null) context.push(path);
    if (path == null) {
      messenger.showSnackBar(const SnackBar(content: Text('Open the Dawabag staff website to act on this.')));
    }
    if (!n.isRead && n.id.isNotEmpty) {
      try {
        await apiService.markNotificationRead(n.id);
        ref.invalidate(notificationInboxProvider);
      } catch (_) {
        // Read state is cosmetic; the inbox reloads from the server next time
      }
    }
  }

  Future<void> _readAll(WidgetRef ref, ScaffoldMessengerState messenger) async {
    try {
      await apiService.markAllNotificationsRead();
      ref.invalidate(notificationInboxProvider);
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(ApiService.errorMessage(e, fallback: 'Could not mark as read'))));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final inbox = ref.watch(notificationInboxProvider);
    final unread = inbox.valueOrNull?.unread ?? 0;
    return Scaffold(
      appBar: AppBar(
        title: const Text('Notifications'),
        actions: [
          if (unread > 0)
            TextButton(
              onPressed: () => _readAll(ref, ScaffoldMessenger.of(context)),
              child: const Text('Mark all read'),
            ),
        ],
      ),
      body: inbox.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load your notifications'),
          onRetry: () => ref.invalidate(notificationInboxProvider),
        ),
        data: (box) => RefreshIndicator(
          color: AppTheme.brandTeal,
          onRefresh: () => ref.refresh(notificationInboxProvider.future),
          child: box.items.isEmpty
              ? ListView(children: const [
                  SizedBox(height: 80),
                  EmptyState(
                    icon: Icons.notifications_none_outlined,
                    title: 'No notifications yet',
                    hint: 'Order updates, refunds and replies to your complaints appear here.',
                  ),
                ])
              : ListView.separated(
                  itemCount: box.items.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (c, i) => NotificationTile(
                    notification: box.items[i],
                    onTap: () => _open(c, ref, box.items[i]),
                  ),
                ),
        ),
      ),
    );
  }
}
