import '../models/two_factor.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Two-step sign-in endpoints (Sprint 42; backend controllers/twoFactor.controller.ts,
/// C-41, C-43, C-46). The challenge token, the key and the recovery codes pass
/// through memory only; a session that comes back is stored like every other
/// (access token in memory, refresh token in the OS keychain).
extension TwoFactorApi on ApiService {
  /// POST /auth/2fa/verify { challenge_token, code } — an authenticator code or
  /// a recovery code. Stores the session; returns the answer's `data`
  /// (user fields, `second_step`, `recovery_codes_left`).
  Future<Map<String, dynamic>> verifySecondStep(String challengeToken, String code) async {
    final res = await dio.post('/auth/2fa/verify', data: {'challenge_token': challengeToken, 'code': code.trim()});
    final data = apiData(res);
    await setSessionFromAuthData(data);
    return data;
  }

  /// POST /auth/2fa/enrol/start — with the 'enrol' challenge at sign-in, or
  /// signed in (no token) from the account page.
  Future<TwoFactorEnrolment> startTwoFactorEnrolment({String? challengeToken}) async {
    final res = await dio.post('/auth/2fa/enrol/start', data: {
      if (challengeToken != null) 'challenge_token': challengeToken,
    });
    return TwoFactorEnrolment.fromJson(apiData(res));
  }

  /// POST /auth/2fa/enrol/confirm { code, challenge_token? } — switches it on.
  /// The server opens a two-step session (stored here) and returns the ten
  /// recovery codes ONCE in `data.recovery_codes`; the caller shows them and
  /// lets them go — they are never written anywhere on the device.
  Future<Map<String, dynamic>> confirmTwoFactorEnrolment(String code, {String? challengeToken}) async {
    final res = await dio.post('/auth/2fa/enrol/confirm', data: {
      'code': code.trim(),
      if (challengeToken != null) 'challenge_token': challengeToken,
    });
    final data = apiData(res);
    if (data['access_token'] is String) await setSessionFromAuthData(data);
    return data;
  }

  /// GET /auth/2fa/status
  Future<TwoFactorStatus> fetchTwoFactorStatus() async =>
      TwoFactorStatus.fromJson(apiData(await dio.get('/auth/2fa/status')));

  /// POST /auth/2fa/recovery-codes { password, code } — ten new codes; the old ones stop working.
  Future<List<String>> renewRecoveryCodes(String password, String code) async {
    final res = await dio.post('/auth/2fa/recovery-codes', data: {'password': password, 'code': code.trim()});
    return recoveryCodesOf(apiData(res));
  }

  /// POST /auth/2fa/disable { password, code } — only where the server's policy allows.
  /// Returns the server's sentence.
  Future<String> disableTwoFactor(String password, String code) async {
    final res = await dio.post('/auth/2fa/disable', data: {'password': password, 'code': code.trim()});
    final body = res.data;
    return body is Map && body['message'] is String ? body['message'] as String : 'Two-step sign-in is off';
  }
}

/// The recovery codes in an answer's `data`.
List<String> recoveryCodesOf(Map<String, dynamic> data) =>
    data['recovery_codes'] is List ? (data['recovery_codes'] as List).map((c) => '$c').toList() : const [];

// ── The server's codes (backend services/twoFactor/*) ──────────────────────

/// 400 — the code is not right; stay and try again.
const kTwoFactorCodeWrong = 'TWO_FACTOR_CODE_WRONG';

/// 429 — too many wrong codes; wait (the sentence says how long).
const kTwoFactorPaused = 'TWO_FACTOR_PAUSED';

/// 401 — the sign-in challenge is gone (expired or used): sign in again.
const kTwoFactorChallengeExpired = 'TWO_FACTOR_CHALLENGE_EXPIRED';

/// 409 — the server cannot check authenticator codes (its key changed).
const kTwoFactorKeyChanged = 'TWO_FACTOR_KEY_CHANGED';

/// 401 from /auth/refresh — this login now uses two-step sign-in: sign in again.
const kTwoFactorSignInRequired = 'TWO_FACTOR_SIGN_IN_REQUIRED';

bool isTwoFactorChallengeExpired(Object e) =>
    apiErrorStatus(e) == 401 && apiErrorCode(e) == kTwoFactorChallengeExpired;

bool isTwoFactorPaused(Object e) => apiErrorStatus(e) == 429 && apiErrorCode(e) == kTwoFactorPaused;
