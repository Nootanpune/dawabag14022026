import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:pretty_dio_logger/pretty_dio_logger.dart';

const String _baseUrl = String.fromEnvironment(
  'API_URL',
  defaultValue: 'http://10.0.2.2:4000', // Android emulator localhost
);

class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  late final Dio _dio;
  final _storage = const FlutterSecureStorage();
  bool _isRefreshing = false;

  ApiService._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: '$_baseUrl/api/v1',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    ));

    _dio.interceptors.addAll([
      PrettyDioLogger(requestBody: true, responseBody: false),
      InterceptorsWrapper(
        onRequest: _onRequest,
        onError: _onError,
      ),
    ]);
  }

  Dio get dio => _dio;

  Future<void> _onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await _storage.read(key: 'access_token');
    if (token != null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  Future<void> _onError(
    DioException error,
    ErrorInterceptorHandler handler,
  ) async {
    if (error.response?.statusCode == 401 && !_isRefreshing) {
      _isRefreshing = true;
      try {
        final refreshToken = await _storage.read(key: 'refresh_token');
        if (refreshToken == null) {
          await _clearTokens();
          handler.next(error);
          return;
        }

        final refreshDio = Dio();
        final res = await refreshDio.post(
          '$_baseUrl/api/v1/auth/refresh',
          data: {'refresh_token': refreshToken},
        );

        final newAccess = res.data['data']['access_token'];
        final newRefresh = res.data['data']['refresh_token'];
        await _storage.write(key: 'access_token', value: newAccess);
        await _storage.write(key: 'refresh_token', value: newRefresh);

        // Retry original request
        final opts = error.requestOptions;
        opts.headers['Authorization'] = 'Bearer $newAccess';
        final retryRes = await _dio.fetch(opts);
        handler.resolve(retryRes);
      } catch (_) {
        await _clearTokens();
        handler.next(error);
      } finally {
        _isRefreshing = false;
      }
    } else {
      handler.next(error);
    }
  }

  Future<void> saveTokens(String accessToken, String refreshToken) async {
    await _storage.write(key: 'access_token', value: accessToken);
    await _storage.write(key: 'refresh_token', value: refreshToken);
  }

  Future<void> _clearTokens() async {
    await _storage.deleteAll();
  }

  Future<void> logout() async {
    try {
      await _dio.post('/auth/logout');
    } catch (_) {}
    await _clearTokens();
  }

  Future<bool> hasValidToken() async {
    return await _storage.read(key: 'access_token') != null;
  }
}

final apiService = ApiService();
