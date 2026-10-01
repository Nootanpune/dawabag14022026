import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

import 'api_service.dart';

/// Push device registration (Sprint 8). The server keeps the list of a
/// user's devices; the app never stores the FCM token itself.
extension DeviceApi on ApiService {
  /// POST /users/me/devices { token, platform: 'android' | 'ios' | 'web' }.
  /// 409 "This device is registered to another account; sign out there first"
  /// is not an error for this app: the phone simply gets no pushes for this
  /// account until the other account signs out, so it is logged and ignored.
  Future<void> registerDevice(String token, String platform) async {
    try {
      await dio.post('/users/me/devices', data: {'token': token, 'platform': platform});
    } on DioException catch (e) {
      if (e.response?.statusCode == 409) {
        debugPrint('Push device not registered: ${ApiService.errorMessage(e, fallback: 'registered to another account')}');
        return;
      }
      rethrow;
    }
  }

  /// DELETE /users/me/devices { token }.
  Future<void> unregisterDevice(String token) async {
    await dio.delete('/users/me/devices', data: {'token': token});
  }
}
