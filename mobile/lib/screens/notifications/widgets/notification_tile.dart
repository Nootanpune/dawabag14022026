import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/app_notification.dart';
import '../../../utils/ist.dart';
import '../../../utils/notification_kinds.dart';

/// One inbox row: the type's icon, the server's title and text (the type's
/// own title when the server sent none), when it was sent, and an unread dot.
class NotificationTile extends StatelessWidget {
  final AppNotification notification;
  final VoidCallback onTap;
  const NotificationTile({super.key, required this.notification, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final n = notification;
    final kind = notificationKind(n.type);
    final title = n.title.isNotEmpty ? n.title : kind.title;
    final iconBg = kind.attention ? AppTheme.amberBadge : AppTheme.brandTeal50;
    final iconFg = kind.attention ? AppTheme.amberText : AppTheme.brandTeal700;
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(color: iconBg, shape: BoxShape.circle),
              child: Icon(kind.icon, size: 19, color: iconFg),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title,
                      style: TextStyle(fontSize: 14, fontWeight: n.isRead ? FontWeight.w500 : FontWeight.w700)),
                  if (n.displayBody.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(n.displayBody, style: TextStyle(fontSize: 13, height: 1.3, color: AppTheme.muted(context))),
                  ],
                  if (n.sentAt != null) ...[
                    const SizedBox(height: 4),
                    Text(formatDateTimeIst(n.sentAt), style: TextStyle(fontSize: 11.5, color: Colors.grey.shade600)),
                  ],
                ],
              ),
            ),
            if (!n.isRead)
              Container(
                key: const ValueKey('unread-dot'),
                margin: const EdgeInsets.only(left: 8, top: 6),
                width: 8,
                height: 8,
                decoration: const BoxDecoration(color: AppTheme.brandTeal, shape: BoxShape.circle),
              ),
          ],
        ),
      ),
    );
  }
}
