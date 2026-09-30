import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/api_service.dart';
import '../services/registration_api.dart';

/// Signed-in account state, held in memory only. It comes from the auth
/// responses (login / verify-otp / refresh) and GET /users/me — never from
/// device storage (owner rule: the server is the single source of truth).
class AuthState {
  final bool isAuthenticated;
  final bool isLoading;
  final Map<String, dynamic>? user;
  final String? error;

  const AuthState({
    this.isAuthenticated = false,
    this.isLoading = false,
    this.user,
    this.error,
  });

  AuthState copyWith({
    bool? isAuthenticated,
    bool? isLoading,
    Map<String, dynamic>? user,
    String? error,
  }) =>
      AuthState(
        isAuthenticated: isAuthenticated ?? this.isAuthenticated,
        isLoading: isLoading ?? this.isLoading,
        user: user ?? this.user,
        error: error,
      );

  /// 'customer' | 'b2b_retailer' | 'b2b_wholesaler' | 'doc_hospital'
  String? get customerType => user?['customer_type'] as String?;

  /// not_required | pending_otp | pending_kyc | approved | rejected | ...
  String? get kycStatus => user?['kyc_status'] as String?;
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier() : super(const AuthState()) {
    apiService.onSessionExpired = _onSessionExpired;
    _restoreSession();
  }

  /// App start: keychain refresh token → POST /auth/refresh → new session.
  Future<void> _restoreSession() async {
    state = state.copyWith(isLoading: true);
    final data = await apiService.restoreSession();
    if (!mounted) return;
    if (data == null) {
      state = const AuthState();
      return;
    }
    completeSignIn(data);
  }

  void _onSessionExpired() {
    if (mounted && state.isAuthenticated) state = const AuthState();
  }

  Future<bool> login(String mobile, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final res = await apiService.dio.post('/auth/login', data: {
        'mobile': mobile,
        'password': password,
      });
      final data = ApiService.dataOf(res);
      await apiService.setSessionFromAuthData(data);
      completeSignIn(data);
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
    state = state.copyWith(
      isAuthenticated: true,
      isLoading: false,
      user: userFromAuthData(authData),
      error: null,
    );
    fetchMe();
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
    await apiService.logout();
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
