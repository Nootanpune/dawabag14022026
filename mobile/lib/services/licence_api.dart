import '../models/drug_licence.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// The signed-in business or doctor account's drug licences (Sprint 30).
/// Read-only in the app; renewals are sent from the website account page.
extension LicenceApi on ApiService {
  /// GET /users/me/licences
  Future<DrugLicenceSummary> getMyLicences() async {
    final res = await dio.get('/users/me/licences');
    return DrugLicenceSummary.fromJson(apiData(res));
  }
}
