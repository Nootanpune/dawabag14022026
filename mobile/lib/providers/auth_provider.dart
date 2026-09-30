import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../services/api_service.dart';

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
  final _storage = const FlutterSecureStorage();

  AuthNotifier() : super(const AuthState()) {
    _checkAuth();
  }

  Future<void> _checkAuth() async {
    state = state.copyWith(isLoading: true);
    final token = await _storage.read(key: 'access_token');
    if (token == null) {
      state = state.copyWith(isLoading: false, isAuthenticated: false);
      return;
    }
    try {
      final res = await apiService.dio.get('/users/me');
      state = state.copyWith(
        isAuthenticated: true,
        isLoading: false,
        user: res.data['data'] as Map<String, dynamic>,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false, isAuthenticated: false);
    }
  }

  Future<bool> login(String mobile, String password) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final res = await apiService.dio.post('/auth/login', data: {
        'mobile': mobile,
        'password': password,
      });
      final data = ApiService.dataOf(res);
      await apiService.saveTokens(
        data['access_token'] as String,
        data['refresh_token'] as String,
      );
      state = state.copyWith(
        isAuthenticated: true,
        isLoading: false,
        user: userFromAuthData(data),
      );
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

  /// Verifies the OTP and stores the tokens, but does NOT publish the session
  /// to [state] yet. Used by the registration flow so the router does not
  /// redirect away from the auth screens while KYC documents are uploaded.
  /// Call [completeSignIn] with the returned map when done.
  /// Throws (DioException) on failure; use [ApiService.errorMessage].
  Future<Map<String, dynamic>> verifyOTPAndSaveTokens(String mobile, String otp) {
    return apiService.verifyOtp(mobile, otp);
  }

  /// Publishes a signed-in session from a verify-otp / login response map.
  void completeSignIn(Map<String, dynamic> authData) {
    state = state.copyWith(
      isAuthenticated: true,
      isLoading: false,
      user: userFromAuthData(authData),
      error: null,
    );
  }

  /// Builds the stored user map from a login / verify-otp response `data`.
  static Map<String, dynamic> userFromAuthData(Map<String, dynamic> data) => {
        'id': data['user_id'],
        'role': data['role'],
        'full_name': data['full_name'],
        'customer_type': data['customer_type'],
        'kyc_status': data['kyc_status'],
      };

  Future<void> logout() async {
    state = state.copyWith(isLoading: true);
    await apiService.logout();
    state = const AuthState();
  }

  Future<void> fetchMe() async {
    try {
      final res = await apiService.dio.get('/users/me');
      final me = res.data['data'] as Map<String, dynamic>;
      // Keep customer_type / kyc_status from login if /users/me omits them.
      state = state.copyWith(user: {...?state.user, ...me});
    } catch (_) {}
  }

  String _extractError(Object e) =>
      ApiService.errorMessage(e, fallback: 'An error occurred');
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (_) => AuthNotifier(),
);
