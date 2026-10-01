import 'dart:async';

import 'package:go_router/go_router.dart';

/// Opens the right screen when the user taps a push notification.
///
/// The push data payload carries only `type` and `order_id` (no personal or
/// medical data in the notification). Order notifications open
/// /orders/:id, which loads everything from GET /orders/:id.
///
/// A tap that arrives before the router exists or before the session is
/// restored (cold start) is held in memory and opened once both are ready.
class NotificationTapRouter {
  NotificationTapRouter._();

  /// Push `type`s that open the order detail screen.
  static const Set<String> orderTypes = {
    'dispatched',
    'out_for_delivery',
    'delivered',
    'order_status',
    'packed',
    'payment_confirmed',
  };

  static GoRouter? _router;
  static bool _signedIn = false;
  static String? _pendingOrderId;

  /// The order id to open for a push data payload, or null.
  static String? orderIdFor(Map<String, dynamic> data) {
    final type = data['type']?.toString();
    final orderId = data['order_id']?.toString().trim();
    if (type == null || !orderTypes.contains(type)) return null;
    if (orderId == null || orderId.isEmpty) return null;
    return orderId;
  }

  /// Handles a tapped FCM message's data payload.
  static void handleData(Map<String, dynamic> data) => openOrder(orderIdFor(data));

  /// Opens /orders/:orderId now, or once the app is ready.
  static void openOrder(String? orderId) {
    if (orderId == null || orderId.isEmpty) return;
    _pendingOrderId = orderId;
    _flush();
  }

  /// Called from the app root with the app's router.
  static void attach(GoRouter router) {
    if (identical(_router, router)) return;
    _router = router;
    _flush();
  }

  /// Called whenever the signed-in state changes.
  static void setSignedIn(bool signedIn) {
    _signedIn = signedIn;
    _flush();
  }

  static void _flush() {
    final router = _router;
    final orderId = _pendingOrderId;
    if (router == null || !_signedIn || orderId == null) return;
    _pendingOrderId = null;
    // Navigate outside the current build / listener callback.
    scheduleMicrotask(() => router.push('/orders/${Uri.encodeComponent(orderId)}'));
  }
}
