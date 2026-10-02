import 'api_service.dart';
import 'api_utils.dart';

/// Registration, OTP and KYC-document endpoints (registration API contract).
extension RegistrationApi on ApiService {
  /// POST /auth/register. Returns `data`
  /// (`mobile, otp_sent, customer_type, kyc_required, required_documents`).
  Future<Map<String, dynamic>> register(Map<String, dynamic> payload) async {
    final res = await dio.post('/auth/register', data: payload);
    return apiData(res);
  }

  /// POST /auth/send-otp (resend).
  Future<void> sendOtp(String mobile) async {
    await dio.post('/auth/send-otp', data: {'mobile': mobile});
  }

  /// POST /auth/verify-otp. On success the session is stored (access token in
  /// memory, refresh token in the keychain) and the response `data` returned
  /// (`user_id, role, customer_type, kyc_status, full_name, access_token, ...`).
  Future<Map<String, dynamic>> verifyOtp(String mobile, String otp) async {
    final res = await dio.post('/auth/verify-otp', data: {
      'mobile': mobile,
      'otp': otp,
    });
    final data = apiData(res);
    await setSessionFromAuthData(data);
    return data;
  }

  /// POST /kyc/documents (multipart: document_type + file).
  /// Returns `{document_type, uploaded, kyc_status, missing_documents}`.
  Future<Map<String, dynamic>> uploadKycDocument({
    required String documentType,
    required String filePath,
    required String filename,
    String? accessToken,
  }) {
    return uploadMultipart(
      '/kyc/documents',
      filePath: filePath,
      filename: filename,
      fields: {'document_type': documentType},
      accessToken: accessToken,
    );
  }

  /// GET /kyc/documents — `{customer_type, kyc_status, required, uploaded, missing}`.
  Future<Map<String, dynamic>> getKycDocuments() async {
    final res = await dio.get('/kyc/documents');
    return apiData(res);
  }
}
