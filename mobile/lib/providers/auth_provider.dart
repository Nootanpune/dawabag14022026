import 'package:dio/dio.dart' show Response;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../models/two_factor.dart';
import '../services/api_service.dart';
import '../services/push_device_service.dart';
import '../services/registration_api.dart';

/// Signed-in account state, held in memory only. It comes from the auth
/// responses (login / verify-otp / refresh) and GET /users/me — never from
/// device storage (owner rule: the server is the single source of truth).
class AuthState {
  final bool isAuthenticated;
  final bool isLoading;
  final Map<String, dynamic>? user;
  final String? error;
  /// A temporary password from Dawabag's admin must be replaced before anything
  /// else (Sprint 28 server rule; Sprint 32 app screen). From the server only.
  final bool mustChangePassword;

  /// Sprint 42: a staff or partner login passed the first step and the server
  /// asks for the second (authenticator code, or setting it up). Memory only;
  /// no session exists yet. Like [error], [copyWith] drops it unless passed.
  final TwoFactorChallenge? challenge;

  /// A sentence for the sign-in screen after the session or the sign-in ended
  /// on the server's word (challenge expired, two-step sign-in now required).
  /// Like [error], [copyWith] drops it unless passed.
  final String? notice;

  const AuthState({
    this.isAuthenticated = false,
    this.isLoading = false,
    this.user,
    this.error,
    this.mustChangePassword = false,
    this.challenge,
    this.notice,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    bool? isLoading,
    Map<String, dynamic>? user,
    String? error,
    bool? mustChangePassword,
    TwoFactorChallenge? challenge,
    String? notice,
  }) =>
      AuthState(
        isAuthenticated: isAuthenticated ?? this.isAuthenticated,
        isLoading: isLoading ?? this.isLoading,
        user: user ?? this.user,
        error: error,
        mustChangePassword: mustChangePassword ?? this.mustChangePassword,
        challenge: challenge,
        notice: notice,
      );

  /// 'customer' | 'b2b_retailer' | 'b2b_wholesaler' | 'doc_hospital'
  String? get customerType => user?['customer_type'] as String?;

  /// not_required | pending_otp | pending_kyc | approved | rejected | ...
  String? get kycStatus => user?['kyc_status'] as String?;
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState()) {
    apiService.onSessionExpired = _onSessionExpired;
    apiService.onPasswordChangeRequired = requirePasswordChange;
    apiService.onSignInRequired = _onSignInRequired;
    _restoreSession();
  }

  /// App start: keychain refresh token → POST /auth/refresh → new session.
  Future<void> _restoreSession() async {
    state = state.copyWith(isLoading: true);
    final data = await apiService.restoreSession();
    if (!mounted) return;
    if (data == null) {
      // Keeps a "sign in again" sentence the refresh just produced (Sprint 42)
      state = AuthState(notice: state.notice);
      return;
    }
    completeSignIn(data);
  }

  void _onSessionExpired() {
    if (mounted && state.isAuthenticated) state = const AuthState();
  }

  /// /auth/refresh answered 401 TWO_FACTOR_SIGN_IN_REQUIRED (Sprint 42): the
  /// API client already cleared the session; sign-in shows [message].
  void _onSignInRequired(String message) {
    if (mounted) state = AuthState(notice: message);
  }

  /// The challenge in an auth answer, published to [state]; null for a session.
  bool _tookChallenge(Response<dynamic> res) {
    final body = res.data;
    final ch = TwoFactorChallenge.tryParse(ApiService.dataOf(res),
        message: body is Map ? body['message']?.toString() : null);
    if (ch == null) return false;
    state = AuthState(challenge: ch);
    return true;
  }

  /// Signs in with mobile + password. True when signed in. False with
  /// [AuthState.challenge] set when a staff or partner login must give the
  /// second step first (Sprint 42), or with [AuthState.error] on failure.
  Future<bool> login(String mobile, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final res = await apiService.dio.post('/auth/login', data: {
        'mobile': mobile,
        'password': password,
      });
      if (_tookChallenge(res)) return false;
      final data = ApiService.dataOf(res);
      await apiService.setSessionFromAuthData(data);
      // The login response has no mobile; the change-password rules need it
      completeSignIn({...data, 'mobile': data['mobile'] ?? mobile});
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: _extractError(e));
      return false;
    }
  }

  Future<bool> verifyOTP(String mobile, String otp) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final data = await verifyOTPAndSaveTokens(mobile, otp);
      // Sprint 42: a staff or partner login gives the second step first
      final ch = TwoFactorChallenge.tryParse(data);
      if (ch != null) {
        state = AuthState(challenge: ch);
        return false;
      }
      completeSignIn(data);
      return true;
    } catch (e) {
      state = state.copyWith(isLoading: false, error: _extractError(e));
      return false;
    }
  }

  /// Verifies the OTP and starts the API session, but does NOT publish it to
  /// [state] yet. Used by the registration flow so the router does not
  /// redirect away from the auth screens while KYC documents are uploaded.
  /// Call [completeSignIn] with the returned map when done.
  /// Throws (DioException) on failure; use [ApiService.errorMessage].
  Future<Map<String, dynamic>> verifyOTPAndSaveTokens(String mobile, String otp) {
    return apiService.verifyOtp(mobile, otp);
  }

  /// Publishes a signed-in session from a login / verify-otp / refresh
  /// response map, then loads the full profile from GET /users/me.
  void completeSignIn(Map<String, dynamic> authData) {
    final mustChange = authData['must_change_password'] == true;
    state = state.copyWith(
      isAuthenticated: true,
      isLoading: false,
      user: userFromAuthData(authData),
      error: null,
      mustChangePassword: mustChange,
    );
    // Until the temporary password is replaced the server refuses everything else
    if (mustChange) return;
    fetchMe();
    // Push: register this device with the server (POST /users/me/devices).
    PushDeviceService.register();
  }

  // ── Two-step sign-in (Sprint 42) ─────────────────────────────────────────

  /// A first step elsewhere (e.g. "Forgot password") answered with a challenge.
  void startSecondStep(TwoFactorChallenge challenge) => state = AuthState(challenge: challenge);

  /// The challenge is gone on the server (expired, used, or the sign-in was
  /// paused): back to sign-in with [message].
  void challengeEnded(String message) => state = AuthState(notice: message);

  /// "Cancel and sign in again": forget the challenge.
  void cancelSecondStep() => state = const AuthState();

  /// The sign-in screen has shown the notice.
  void clearNotice() {
    if (state.notice != null) state = state.copyWith(challenge: state.challenge);
  }

  /// The server answered 403 PASSWORD_CHANGE_REQUIRED: show the change screen.
  void requirePasswordChange() {
    if (mounted && state.isAuthenticated && !state.mustChangePassword) {
      state = state.copyWith(mustChangePassword: true);
    }
  }

  /// POST /auth/change-password succeeded: the new session (already stored by
  /// the API client) is published and the account opens.
  void passwordChanged(Map<String, dynamic> authData) {
    final fresh = userFromAuthData(authData)..removeWhere((_, v) => v == null);
    final user = {...?state.user, ...fresh};
    state = state.copyWith(user: user, mustChangePassword: false, error: null);
    fetchMe();
    PushDeviceService.register();
  }

  /// Builds the in-memory user map from an auth response `data`.
  static Map<String, dynamic> userFromAuthData(Map<String, dynamic> data) => {
        'id': data['user_id'],
        'role': data['role'],
        'full_name': data['full_name'],
        'customer_type': data['customer_type'],
        'kyc_status': data['kyc_status'],
        if (data['mobile'] != null) 'mobile': data['mobile'],
      };

  Future<void> logout() async {
    state = state.copyWith(isLoading: true);
    // The server forgets this device for push as part of logout.
    final fcmToken = await PushDeviceService.currentToken();
    await apiService.logout(fcmToken: fcmToken);
    if (mounted) state = const AuthState();
  }

  /// GET /users/me — current account state (profile, customer_type,
  /// kyc_status, wallet, credit) into memory.
  Future<void> fetchMe() async {
    try {
      final res = await apiService.dio.get('/users/me');
      final me = ApiService.dataOf(res);
      if (!mounted || !state.isAuthenticated || me.isEmpty) return;
      state = state.copyWith(user: {...?state.user, ...me});
    } catch (_) {}
  }

  String _extractError(Object e) =>
      ApiService.errorMessage(e, fallback: 'An error occurred');
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (_) => AuthNotifier(),
);
