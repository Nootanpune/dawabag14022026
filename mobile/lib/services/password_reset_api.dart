import 'api_service.dart';
import 'registration_api.dart';

/// The sentence shown after asking for a code. Since Sprint 35 the server
/// answers POST /auth/send-otp the same way whether or not the mobile has an
/// account (so nobody can probe which numbers are registered, C-41 / C-44);
/// the app says the same neutral thing and never relies on a 404.
String codeSentText(String mobile) =>
    "If +91 $mobile has a Dawabag account, we've sent a 6-digit code to it.";

/// Forgot password (Sprint 35): a code to the registered mobile first, then a
/// new password. The code proves the person holds the mobile; the server checks
/// the code, the password rules, and ends every other session (C-44). The app
/// keeps the code and passwords in the form's memory only (C-41).
extension PasswordResetApi on ApiService {
  /// POST /auth/send-otp — the same code the sign-in with OTP uses. Succeeds
  /// for every well-formed mobile, registered or not.
  Future<void> sendPasswordResetOtp(String mobile) => sendOtp(mobile);

  /// POST /auth/reset-password { mobile, otp, new_password }. A wrong or
  /// expired code — or a mobile with no account — is the same 400
  /// ("The code is wrong or has expired"); throws the DioException for
  /// [ApiService.errorMessage].
  Future<void> resetPassword({required String mobile, required String otp, required String newPassword}) async {
    await dio.post('/auth/reset-password', data: {
      'mobile': mobile,
      'otp': otp,
      'new_password': newPassword,
    });
  }
}

/// Whether a reset error is about the code (shown on the code step).
bool isCodeProblem(String message) {
  final m = message.toLowerCase();
  return m.contains('otp') || m.contains('code');
}
