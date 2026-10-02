import 'package:dio/dio.dart';

import 'api_service.dart';
import 'registration_api.dart';

/// Thrown when this server cannot reset a password yet (no reset endpoint).
class PasswordResetUnavailable implements Exception {
  const PasswordResetUnavailable();
}

/// Forgot password (Sprint 35): an OTP to the registered mobile first, then a
/// new password. The OTP proves the person holds the mobile; the server checks
/// the OTP, the password rules, and ends every other session (C-44). The app
/// keeps the OTP and passwords in the form's memory only (C-41).
extension PasswordResetApi on ApiService {
  /// POST /auth/send-otp — the same OTP the sign-in with OTP uses.
  Future<void> sendPasswordResetOtp(String mobile) => sendOtp(mobile);

  /// POST /auth/reset-password { mobile, otp, new_password }.
  /// Throws [PasswordResetUnavailable] when the server has no such endpoint
  /// (404 / 405), otherwise the DioException for [ApiService.errorMessage].
  Future<void> resetPassword({required String mobile, required String otp, required String newPassword}) async {
    try {
      await dio.post('/auth/reset-password', data: {
        'mobile': mobile,
        'otp': otp,
        'new_password': newPassword,
      });
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 405 || (status == 404 && isMissingRoute(e.response?.data))) {
        throw const PasswordResetUnavailable();
      }
      rethrow;
    }
  }
}

/// The API's own 404 for an unknown path ("Route POST /x not found", backend
/// middleware/notFound.ts) — unlike a 404 such as "Mobile not registered".
bool isMissingRoute(Object? body) {
  if (body is! Map) return true;
  final message = (body['message'] ?? body['error'])?.toString() ?? '';
  return message.isEmpty || message.startsWith('Route ');
}
