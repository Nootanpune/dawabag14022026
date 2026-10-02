import '../models/drug_licence.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// The signed-in business or doctor account's drug licences (Sprint 30), and
/// renewals sent from the app (Sprint 32) — the same API the web's
/// /account/licences uses. What is sent waits for Dawabag's check; a checked
/// licence is never changed by its holder (C-07, C-11, C-14). Copies go straight
/// to the server's private object store; the app keeps none (C-41).
extension LicenceApi on ApiService {
  /// GET /users/me/licences
  Future<DrugLicenceSummary> getMyLicences() async {
    final res = await dio.get('/users/me/licences');
    return DrugLicenceSummary.fromJson(apiData(res));
  }

  /// POST /users/me/licences { licences: [...] } → { licence_ids, message }.
  Future<({List<String> ids, String message})> submitLicences(List<Map<String, dynamic>> licences) async {
    final res = await dio.post('/users/me/licences', data: {'licences': licences});
    final data = apiData(res);
    final ids = (data['licence_ids'] is List) ? (data['licence_ids'] as List).map((e) => e.toString()).toList() : <String>[];
    return (
      ids: ids,
      message: data['message']?.toString() ?? 'Sent to Dawabag — the licence counts once our team has checked it',
    );
  }

  /// POST /users/me/licences/:id/document (multipart `file`; PDF, JPG or PNG,
  /// up to 5 MB) — only while the licence waits for the check.
  Future<void> uploadLicenceCopy(String licenceId, {required String filePath, required String filename}) async {
    await uploadMultipart(
      '/users/me/licences/${Uri.encodeComponent(licenceId)}/document',
      filePath: filePath,
      filename: filename,
      fileField: 'file',
      mimeType: mimeTypeForFilename(filename) ?? 'image/jpeg',
    );
  }
}
