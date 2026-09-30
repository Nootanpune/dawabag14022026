import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http_parser/http_parser.dart' show MediaType;
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

  Future<String?> readAccessToken() => _storage.read(key: 'access_token');

  // ── Registration / OTP ─────────────────────────────────────────────────────

  /// POST /auth/register. Returns the response `data` map
  /// (`mobile, otp_sent, customer_type, kyc_required, required_documents`).
  Future<Map<String, dynamic>> register(Map<String, dynamic> payload) async {
    final res = await _dio.post('/auth/register', data: payload);
    return dataOf(res);
  }

  /// POST /auth/send-otp (resend).
  Future<void> sendOtp(String mobile) async {
    await _dio.post('/auth/send-otp', data: {'mobile': mobile});
  }

  /// POST /auth/verify-otp. On success the access/refresh tokens are saved to
  /// secure storage and the response `data` map is returned
  /// (`user_id, role, customer_type, kyc_status, full_name, access_token, ...`).
  Future<Map<String, dynamic>> verifyOtp(String mobile, String otp) async {
    final res = await _dio.post('/auth/verify-otp', data: {
      'mobile': mobile,
      'otp': otp,
    });
    final data = dataOf(res);
    await saveTokens(
      data['access_token'] as String,
      data['refresh_token'] as String,
    );
    return data;
  }

  // ── Multipart upload ───────────────────────────────────────────────────────

  /// Generic multipart/form-data POST with a single file part.
  /// The Bearer token is attached by the request interceptor; pass
  /// [accessToken] to set it explicitly.
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
    return dataOf(res);
  }

  /// POST /kyc/documents (multipart: document_type + file).
  /// Returns `{document_type, uploaded, kyc_status, missing_documents}`.
  Future<Map<String, dynamic>> uploadKycDocument({
    required String documentType,
    required String filePath,
    required String filename,
    String? accessToken,
    ProgressCallback? onSendProgress,
  }) {
    return uploadMultipart(
      '/kyc/documents',
      filePath: filePath,
      filename: filename,
      fields: {'document_type': documentType},
      mimeType: mimeTypeForFilename(filename),
      accessToken: accessToken,
      onSendProgress: onSendProgress,
    );
  }

  /// GET /kyc/documents — `{customer_type, kyc_status, required, uploaded, missing}`.
  Future<Map<String, dynamic>> getKycDocuments() async {
    final res = await _dio.get('/kyc/documents');
    return dataOf(res);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  static Map<String, dynamic> dataOf(Response<dynamic> res) {
    final body = res.data;
    if (body is Map && body['data'] is Map) {
      return Map<String, dynamic>.from(body['data'] as Map);
    }
    return <String, dynamic>{};
  }

  static String? mimeTypeForFilename(String filename) {
    final dot = filename.lastIndexOf('.');
    if (dot < 0) return null;
    switch (filename.substring(dot + 1).toLowerCase()) {
      case 'pdf':
        return 'application/pdf';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      default:
        return null;
    }
  }

  /// Human-readable message from an API error. Understands the
  /// `{ success:false, message, errors:[{path, message}] }` envelope
  /// (and the legacy `error` key).
  static String errorMessage(
    Object error, {
    String fallback = 'Something went wrong. Please try again.',
  }) {
    if (error is DioException) {
      final data = error.response?.data;
      if (data is Map) {
        final errors = data['errors'];
        if (errors is List && errors.isNotEmpty) {
          final msgs = errors
              .map((e) => e is Map ? e['message']?.toString() : e?.toString())
              .whereType<String>()
              .where((s) => s.isNotEmpty)
              .toList();
          if (msgs.isNotEmpty) return msgs.join('\n');
        }
        final msg = data['message'] ?? data['error'];
        if (msg is String && msg.isNotEmpty) return msg;
      }
      switch (error.type) {
        case DioExceptionType.connectionTimeout:
        case DioExceptionType.sendTimeout:
        case DioExceptionType.receiveTimeout:
          return 'The request timed out. Check your connection and try again.';
        case DioExceptionType.connectionError:
          return 'Cannot reach the server. Check your internet connection.';
        default:
          break;
      }
    }
    return fallback;
  }
}

final apiService = ApiService();
