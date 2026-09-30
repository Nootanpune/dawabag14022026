import '../models/privacy.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Data-principal rights (C-40..C-44).
/// Responses are shown as-is and never stored on the device. The data export
/// (GET /privacy/export) is deliberately not called here: it would produce a
/// file, and the app writes no files — the website offers it instead.
extension PrivacyApi on ApiService {
  /// GET /privacy/consents
  Future<PrivacyConsents> getConsents() async {
    final res = await dio.get('/privacy/consents');
    return PrivacyConsents.fromJson(apiData(res));
  }

  /// PUT /privacy/consents/marketing { granted } → updated consents
  Future<PrivacyConsents> setMarketingConsent(bool granted) async {
    final res = await dio.put('/privacy/consents/marketing', data: {'granted': granted});
    return PrivacyConsents.fromJson(apiData(res));
  }

  /// POST /privacy/requests { request_type: erasure|correction, details? }.
  /// The server answers 409 when the same kind of request is already pending.
  Future<Map<String, dynamic>> createDataRequest(String requestType, {String? details}) async {
    final res = await dio.post('/privacy/requests', data: {
      'request_type': requestType,
      if (details != null && details.trim().isNotEmpty) 'details': details.trim(),
    });
    return apiData(res);
  }

  /// GET /privacy/requests → the buyer's own correction / erasure requests
  Future<List<DataRequest>> getDataRequests() async {
    final res = await dio.get('/privacy/requests');
    return DataRequest.listFrom(apiData(res));
  }
}
