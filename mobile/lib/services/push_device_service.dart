import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';

import 'api_service.dart';
import 'device_api.dart';

/// Registers this device for push with the server (POST /users/me/devices)
/// after sign-in and whenever FCM rotates the token.
///
/// The FCM token is never stored on the device: it is read from
/// FirebaseMessaging each time it is needed (server is the single source of
/// truth). Every method is a silent no-op when Firebase is not initialised
/// or push is unavailable, so sign-in and sign-out never fail because of it.
class PushDeviceService {
  PushDeviceService._();

  static StreamSubscription<String>? _refreshSub;

  static bool get _firebaseReady => Firebase.apps.isNotEmpty;

  /// 'android' | 'ios' | 'web', as the API expects.
  static String get _platform {
    if (kIsWeb) return 'web';
    return defaultTargetPlatform == TargetPlatform.iOS ? 'ios' : 'android';
  }

  /// The API accepts tokens of 20..4096 characters.
  static bool _validToken(String? token) =>
      token != null && token.length >= 20 && token.length <= 4096;

  /// Current FCM token, or null when push is unavailable.
  static Future<String?> currentToken() async {
    if (!_firebaseReady) return null;
    try {
      return await FirebaseMessaging.instance.getToken().timeout(const Duration(seconds: 5));
    } catch (_) {
      return null;
    }
  }

  /// Starts listening for FCM token rotation. Call once at app start.
  static void listenForTokenRefresh() {
    if (!_firebaseReady || _refreshSub != null) return;
    try {
      _refreshSub = FirebaseMessaging.instance.onTokenRefresh.listen(
        (token) => _send(token),
        onError: (Object _) {},
      );
    } catch (_) {}
  }

  /// Registers the current token for the signed-in user. Call after sign-in.
  static Future<void> register() async {
    if (!apiService.hasSession) return;
    await _send(await currentToken());
  }

  static Future<void> _send(String? token) async {
    if (!apiService.hasSession || !_validToken(token)) return;
    try {
      await apiService.registerDevice(token!, _platform);
    } catch (_) {}
  }
}
