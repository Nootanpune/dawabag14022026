import 'package:dio/dio.dart';

import 'upload_file.dart' show UploadRefused;

/// The `data` object of a `{ success, message, data }` API envelope.
Map<String, dynamic> apiData(Response<dynamic> res) {
  final body = res.data;
  if (body is Map && body['data'] is Map) {
    return Map<String, dynamic>.from(body['data'] as Map);
  }
  return <String, dynamic>{};
}

/// The `data` array of a `{ success, data: [...] }` API envelope (list
/// endpoints such as GET /doctors and GET /consultations/my).
List<Map<String, dynamic>> apiDataList(Response<dynamic> res) {
  final body = res.data;
  if (body is Map && body['data'] is List) {
    return (body['data'] as List)
        .whereType<Map>()
        .map((m) => Map<String, dynamic>.from(m))
        .toList();
  }
  return const [];
}

/// MIME type for an upload, from the file extension (PDF / JPG / PNG).
String? mimeTypeForFilename(String filename) {
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
/// `{ success:false, message, error, errors:[{path, message}] }` envelope
/// (422 validation errors list every field message).
String apiErrorMessage(
  Object error, {
  String fallback = 'Something went wrong. Please try again.',
}) {
  // Refused by the app before upload (HEIC, not PDF/JPG/PNG): the reason as is
  if (error is UploadRefused) return error.message;
  if (error is DioException) {
    // A server fault's own text is technical: a plain sentence with what to do (Sprint 26)
    final status = error.response?.statusCode;
    if (status == 500 || status == 502 || status == 504) {
      return 'Something went wrong on our side. Please try again in a minute.';
    }
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

/// Code the server sends (403) while a login still has the temporary password
/// an admin set (Sprint 28, backend auth.middleware): every route but
/// POST /auth/change-password and /auth/logout is refused until it is changed.
const kPasswordChangeRequired = 'PASSWORD_CHANGE_REQUIRED';

/// The machine-readable `code` of an API error envelope, if any.
String? apiErrorCode(Object error) {
  if (error is! DioException) return null;
  final data = error.response?.data;
  return data is Map ? data['code']?.toString() : null;
}

/// True when the server refused the call until the password is changed.
bool isPasswordChangeRequired(Object error) =>
    error is DioException && error.response?.statusCode == 403 && apiErrorCode(error) == kPasswordChangeRequired;

/// Code the server sends (409) while prescription-medicine sales are paused
/// (Sprint 38 emergency stop, C-08): adding or raising such a line in the cart,
/// POST /orders, /payments/create-order and /payments/demo. The envelope's
/// `message` is ready for the buyer and is shown as is.
const kRxSalesPaused = 'RX_SALES_PAUSED';

/// True when the server refused the call because prescription sales are paused.
bool isRxSalesPaused(Object error) =>
    error is DioException && error.response?.statusCode == 409 && apiErrorCode(error) == kRxSalesPaused;
