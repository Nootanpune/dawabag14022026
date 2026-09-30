import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

class NotificationService {
  static final _localNotifications = FlutterLocalNotificationsPlugin();
  static final _messaging = FirebaseMessaging.instance;

  static Future<void> init() async {
    // Request permission
    await _messaging.requestPermission(alert: true, badge: true, sound: true);

    // Local notifications setup
    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const iosInit = DarwinInitializationSettings();
    await _localNotifications.initialize(
      const InitializationSettings(android: androidInit, iOS: iosInit),
    );

    // Create notification channel (Android)
    const channel = AndroidNotificationChannel(
      'dawabag_orders', 'Order updates',
      description: 'Notifications for order status updates',
      importance: Importance.high,
    );
    await _localNotifications
        .resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    // Foreground messages
    FirebaseMessaging.onMessage.listen((RemoteMessage message) {
      final notification = message.notification;
      if (notification == null) return;
      _localNotifications.show(
        notification.hashCode,
        notification.title,
        notification.body,
        NotificationDetails(
          android: AndroidNotificationDetails(
            channel.id, channel.name,
            channelDescription: channel.description,
            importance: Importance.high,
            priority: Priority.high,
          ),
        ),
      );
    });

    // Background message handler
    FirebaseMessaging.onBackgroundMessage(_backgroundHandler);
  }

  static Future<String?> getToken() => _messaging.getToken();
}

@pragma('vm:entry-point')
Future<void> _backgroundHandler(RemoteMessage message) async {}
