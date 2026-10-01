import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'notification_tap_router.dart';
import 'push_device_service.dart';

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
      // Tap on a foreground notification we showed: payload is the order id.
      onDidReceiveNotificationResponse: (NotificationResponse response) =>
          NotificationTapRouter.openOrder(response.payload),
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
        payload: NotificationTapRouter.orderIdFor(message.data),
      );
    });

    // Background message handler
    FirebaseMessaging.onBackgroundMessage(_backgroundHandler);

    // Taps on a push while the app was in the background.
    FirebaseMessaging.onMessageOpenedApp.listen(
      (RemoteMessage message) => NotificationTapRouter.handleData(message.data),
    );

    // Tap that launched the app from terminated state (held until the router
    // and the restored session are ready).
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      NotificationTapRouter.handleData(initialMessage.data);
    }
    final launch = await _localNotifications.getNotificationAppLaunchDetails();
    if (launch != null && launch.didNotificationLaunchApp) {
      NotificationTapRouter.openOrder(launch.notificationResponse?.payload);
    }

    // Re-register with the server whenever FCM rotates the token.
    PushDeviceService.listenForTokenRefresh();
  }

  static Future<String?> getToken() => _messaging.getToken();
}

@pragma('vm:entry-point')
Future<void> _backgroundHandler(RemoteMessage message) async {}
