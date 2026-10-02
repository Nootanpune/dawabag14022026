import 'api_service.dart';
import 'api_utils.dart';
import '../models/json_utils.dart';

/// The buyer's prescriptions (Sprint 25). Files go straight to the server's
/// object store; the app keeps no copy (C-41). A pharmacist checks every
/// prescription with the order before anything is dispensed (C-08).
extension PrescriptionApi on ApiService {
  /// GET /prescriptions/my → newest first, with status and order.
  Future<List<Map<String, dynamic>>> getMyPrescriptions() async {
    final res = await dio.get('/prescriptions/my');
    final body = res.data;
    return body is Map ? asMapList(body['data']) : const <Map<String, dynamic>>[];
  }

  /// POST /prescriptions/upload (multipart) without an order: kept in the
  /// account and chosen at checkout. Sent with the type its bytes show (a
  /// HEIC photo is refused before upload — Sprint 35).
  Future<Map<String, dynamic>> uploadPrescription({required String filePath, required String filename}) =>
      uploadMultipart('/prescriptions/upload',
          filePath: filePath, filename: filename, fileField: 'prescription', sendTimeout: const Duration(seconds: 60));

  /// GET /prescriptions/:id/url → a signed link valid for minutes (null for an e-prescription).
  Future<String?> prescriptionLink(String id) async {
    final res = await dio.get('/prescriptions/${Uri.encodeComponent(id)}/url');
    return apiData(res)['url']?.toString();
  }
}
