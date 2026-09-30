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
      final data = res.data['data'];
      await apiService.saveTokens(data['access_token'], data['refresh_token']);
      state = state.copyWith(
        isAuthenticated: true,
        isLoading: false,
        user: {'id': data['user_id'], 'role': data['role'], 'full_name': data['full_name']},
      );
      return true;
    } on Exception catch (e) {
      state = state.copyWith(isLoading: false, error: _extractError(e));
      return false;
    }
  }

  Future<bool> verifyOTP(String mobile, String otp) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final res = await apiService.dio.post('/auth/verify-otp', data: {
        'mobile': mobile,
        'otp': otp,
      });
      final data = res.data['data'];
      await apiService.saveTokens(data['access_token'], data['refresh_token']);
      state = state.copyWith(
        isAuthenticated: true,
        isLoading: false,
        user: {'id': data['user_id'], 'role': data['role']},
      );
      return true;
    } on Exception catch (e) {
      state = state.copyWith(isLoading: false, error: _extractError(e));
      return false;
    }
  }

  Future<void> logout() async {
    state = state.copyWith(isLoading: true);
    await apiService.logout();
    state = const AuthState();
  }

  Future<void> fetchMe() async {
    try {
      final res = await apiService.dio.get('/users/me');
      state = state.copyWith(user: res.data['data'] as Map<String, dynamic>);
    } catch (_) {}
  }

  String _extractError(dynamic e) {
    try {
      return (e as dynamic).response?.data?['error'] ?? 'An error occurred';
    } catch (_) {
      return 'An error occurred';
    }
  }
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (_) => AuthNotifier(),
);
