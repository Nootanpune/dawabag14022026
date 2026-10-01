import 'api_service.dart';

/// Push device registration (Sprint 8). The server keeps the list of a
/// user's devices; the app never stores the FCM token itself.
extension DeviceApi on ApiService {
  /// POST /users/me/devices { token, platform: 'android' | 'ios' | 'web' }.
  Future<void> registerDevice(String token, String platform) async {
    await dio.post('/users/me/devices', data: {'token': token, 'platform': platform});
  }

  /// DELETE /users/me/devices { token }.
  Future<void> unregisterDevice(String token) async {
    await dio.delete('/users/me/devices', data: {'token': token});
  }
}
