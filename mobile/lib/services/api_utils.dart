import 'package:dio/dio.dart';

/// The `data` object of a `{ success, message, data }` API envelope.
Map<String, dynamic> apiData(Response<dynamic> res) {
  final body = res.data;
  if (body is Map && body['data'] is Map) {
    return Map<String, dynamic>.from(body['data'] as Map);
  }
  return <String, dynamic>{};
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
