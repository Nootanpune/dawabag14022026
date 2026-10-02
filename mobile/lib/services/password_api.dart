import 'api_service.dart';
import 'api_utils.dart';

/// Changing the signed-in person's password (Sprint 32; server Sprint 28).
extension PasswordApi on ApiService {
  /// POST /auth/change-password { current_password, new_password, refresh_token }.
  /// The server checks the rules (utils/passwordPolicy.ts), clears
  /// must_change_password, ends the old session and returns a new one, which
  /// replaces it here (refresh token in the keychain only). Returns the
  /// response `data` (user_id, role, customer_type, kyc_status, mobile,
  /// full_name, must_change_password: false). Passwords are never stored.
  Future<Map<String, dynamic>> changePassword({required String current, required String next}) async {
    final refresh = await storedRefreshToken();
    final res = await dio.post('/auth/change-password', data: {
      'current_password': current,
      'new_password': next,
      if (refresh != null) 'refresh_token': refresh,
    });
    final data = apiData(res);
    if (data['access_token'] is String) await setSessionFromAuthData(data);
    return data;
  }
}
