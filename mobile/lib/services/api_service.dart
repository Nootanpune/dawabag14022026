import 'package:dio/dio.dart';
import 'package:http_parser/http_parser.dart' show MediaType;
import 'package:pretty_dio_logger/pretty_dio_logger.dart';

import '../config/api_url.dart';
import 'api_utils.dart';
import 'session_store.dart';

/// HTTP client + session.
///
/// Session rules (docs/DECISIONS.md, server-as-single-source-of-truth):
/// - the access token is held in memory only ([_accessToken]);
/// - the refresh token is the only value written to the device, via
///   [SessionStore] (OS keychain). Refresh tokens rotate: every successful
///   /auth/refresh returns a new one, which replaces the old one.
/// - on a 401 the client refreshes once and retries the request.
class ApiService {
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;

  late final Dio _dio;

  /// Client without interceptors, for /auth/refresh and /auth/logout.
  late final Dio _bare;

  final SessionStore _sessionStore = SessionStore();
  String? _accessToken;
  Future<Map<String, dynamic>?>? _refreshInFlight;

  /// Called when the server rejects the refresh token (session is over).
  void Function()? onSessionExpired;

  ApiService._internal() {
    final options = BaseOptions(
      baseUrl: '${apiBaseUrl()}/api/v1',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    );
    _dio = Dio(options);
    _bare = Dio(options);

    _dio.interceptors.addAll([
      PrettyDioLogger(requestBody: false, responseBody: false),
      InterceptorsWrapper(
        onRequest: _onRequest,
        onError: _onError,
      ),
    ]);
  }

  Dio get dio => _dio;

  String? get accessToken => _accessToken;

  bool get hasSession => _accessToken != null;

  // ── Interceptors ───────────────────────────────────────────────────────────

  void _onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final token = _accessToken;
    if (token != null && !options.headers.containsKey('Authorization')) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  Future<void> _onError(DioException error, ErrorInterceptorHandler handler) async {
    final request = error.requestOptions;
    final isUnauthorized = error.response?.statusCode == 401;
    final isAuthCall = request.path.startsWith('/auth/');
    if (!isUnauthorized || isAuthCall || request.extra['retried'] == true) {
      handler.next(error);
      return;
    }

    final session = await refreshSession();
    final token = _accessToken;
    if (session == null || token == null) {
      handler.next(error);
      return;
    }
    try {
      request.extra['retried'] = true;
      request.headers['Authorization'] = 'Bearer $token';
      final response = await _dio.fetch<dynamic>(request);
      handler.resolve(response);
    } on DioException catch (e) {
      handler.next(e);
    }
  }

  // ── Session ────────────────────────────────────────────────────────────────

  /// Stores a new session: access token in memory, refresh token in keychain.
  Future<void> setSession({required String accessToken, String? refreshToken}) async {
    _accessToken = accessToken;
    if (refreshToken != null && refreshToken.isNotEmpty) {
      await _sessionStore.writeRefreshToken(refreshToken);
    }
  }

  /// Stores the tokens from a login / verify-otp / refresh response `data`.
  Future<void> setSessionFromAuthData(Map<String, dynamic> data) => setSession(
        accessToken: data['access_token'] as String,
        refreshToken: data['refresh_token'] as String?,
      );

  Future<void> clearSession() async {
    _accessToken = null;
    await _sessionStore.deleteRefreshToken();
  }

  /// App start: exchanges the keychain refresh token for a new session.
  /// Returns the refresh response `data` (user_id, role, customer_type,
  /// kyc_status, mobile, full_name, ...) or null when signed out.
  Future<Map<String, dynamic>?> restoreSession() async {
    try {
      await _sessionStore.deleteLegacyEntries();
    } catch (_) {}
    return refreshSession();
  }

  /// POST /auth/refresh { refresh_token }. Concurrent callers share one
  /// request, because the server revokes the old refresh token on use.
  Future<Map<String, dynamic>?> refreshSession() {
    return _refreshInFlight ??=
        _refreshRequest().whenComplete(() => _refreshInFlight = null);
  }

  Future<Map<String, dynamic>?> _refreshRequest() async {
    final refreshToken = await _sessionStore.readRefreshToken();
    if (refreshToken == null) {
      _accessToken = null;
      return null;
    }
    try {
      final res = await _bare.post('/auth/refresh', data: {'refresh_token': refreshToken});
      final data = apiData(res);
      if (data['access_token'] is! String) return null;
      await setSessionFromAuthData(data);
      return data;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 401 || status == 403) {
        await clearSession();
        onSessionExpired?.call();
      }
      return null;
    }
  }

  /// POST /auth/logout { refresh_token, fcm_token } with Authorization, then
  /// forget the session locally (keychain entry deleted) even if the call
  /// fails. [fcmToken] (read live from FirebaseMessaging, never stored) lets
  /// the server forget this device for push.
  Future<void> logout({String? fcmToken}) async {
    final refreshToken = await _sessionStore.readRefreshToken();
    final token = _accessToken;
    try {
      await _bare.post(
        '/auth/logout',
        data: {
          if (refreshToken != null) 'refresh_token': refreshToken,
          if (fcmToken != null && fcmToken.isNotEmpty) 'fcm_token': fcmToken,
        },
        options: Options(headers: {if (token != null) 'Authorization': 'Bearer $token'}),
      );
    } catch (_) {}
    await clearSession();
  }

  // ── Multipart upload ───────────────────────────────────────────────────────

  /// Generic multipart/form-data POST with a single file part.
  /// Pass [accessToken] to set the Bearer token explicitly.
  Future<Map<String, dynamic>> uploadMultipart(
    String path, {
    required String filePath,
    required String filename,
    String fileField = 'file',
    Map<String, dynamic> fields = const {},
    String? mimeType,
    String? accessToken,
    ProgressCallback? onSendProgress,
  }) async {
    final formData = FormData.fromMap({
      ...fields,
      fileField: await MultipartFile.fromFile(
        filePath,
        filename: filename,
        contentType: mimeType != null ? MediaType.parse(mimeType) : null,
      ),
    });
    final res = await _dio.post(
      path,
      data: formData,
      onSendProgress: onSendProgress,
      options: Options(
        headers: accessToken != null ? {'Authorization': 'Bearer $accessToken'} : null,
        sendTimeout: const Duration(seconds: 90),
        receiveTimeout: const Duration(seconds: 60),
      ),
    );
    return apiData(res);
  }

  // ── Helpers (kept as statics for existing callers) ─────────────────────────

  static Map<String, dynamic> dataOf(Response<dynamic> res) => apiData(res);

  static String errorMessage(
    Object error, {
    String fallback = 'Something went wrong. Please try again.',
  }) =>
      apiErrorMessage(error, fallback: fallback);
}

final apiService = ApiService();
