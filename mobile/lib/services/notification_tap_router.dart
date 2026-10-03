import 'dart:async';

import 'package:go_router/go_router.dart';

import '../utils/notification_kinds.dart';
import 'dose_actions.dart';

/// Opens the right screen when the user taps a push notification.
///
/// The push data payload carries only `type` and `order_id` (no personal or
/// medical data in the notification). Every type the server sends has a place
/// to open (utils/notification_kinds.dart, Sprint 36): order notifications —
/// including `order_on_hold` — open /orders/:id, which loads everything from
/// GET /orders/:id; refills, complaints, returns, privacy, licences and
/// consultations open their screens; staff-only alerts open nothing.
///
/// A tap that arrives before the router exists or before the session is
/// restored (cold start) is held in memory and opened once both are ready.
class NotificationTapRouter {
  NotificationTapRouter._();

  static GoRouter? _router;
  static bool _signedIn = false;
  static String? _pendingOrderId;
  static String? _pendingPath;

  /// A tapped local notification: a dose alert (Sprint 33, payload 'dose:…')
  /// opens My medicines with that dose highlighted (Sprint 34); an app path
  /// (a shown push, Sprint 36) opens that path; anything else is an order id.
  static void openLocalPayload(String? payload) {
    if (isDosePayload(payload)) {
      openPath(myMedicinesLocation(parseDosePayload(payload)));
      return;
    }
    if (payload != null && payload.startsWith('/')) {
      openPath(payload);
      return;
    }
    openOrder(payload);
  }

  /// The app path to open for a push data payload, or null (nothing to open).
  static String? pathFor(Map<String, dynamic> data) =>
      notificationPath(data['type']?.toString(), orderId: data['order_id']?.toString());

  /// Handles a tapped FCM message's data payload.
  static void handleData(Map<String, dynamic> data) => openPath(pathFor(data));

  /// Opens an app path now, or once the app is ready.
  static void openPath(String? path) {
    if (path == null || path.isEmpty) return;
    _pendingPath = path;
    _flush();
  }

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
    final path = _pendingPath;
    if (router != null && _signedIn && path != null) {
      _pendingPath = null;
      scheduleMicrotask(() => router.push(path));
    }
    final orderId = _pendingOrderId;
    if (router == null || !_signedIn || orderId == null) return;
    _pendingOrderId = null;
    // Navigate outside the current build / listener callback.
    scheduleMicrotask(() => router.push('/orders/${Uri.encodeComponent(orderId)}'));
  }
}
