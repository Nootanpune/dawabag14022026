import '../models/health_profile.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Health profile (Sprint 33): consent first (C-41), deletable any time (C-43, C-44).
extension HealthProfileApi on ApiService {
  Future<HealthProfile> getHealthProfile() async => HealthProfile.fromJson(apiData(await dio.get('/health-profile')));

  Future<HealthProfile> saveHealthProfile({
    bool? consent,
    required List<String> allergies,
    required List<String> conditions,
    required List<String> currentMedicines,
  }) async =>
      HealthProfile.fromJson(apiData(await dio.put('/health-profile', data: {
        if (consent != null) 'consent': consent,
        'allergies': allergies,
        'conditions': conditions,
        'current_medicines': currentMedicines,
      })));

  Future<HealthProfile> deleteHealthProfile() async => HealthProfile.fromJson(apiData(await dio.delete('/health-profile')));

  Future<HealthProfile> saveFamilyMember({
    String? id,
    required String name,
    required String relationship,
    int? age,
    required List<String> allergies,
    required List<String> conditions,
  }) async {
    final body = {'full_name': name, 'relationship': relationship, 'age_years': age, 'allergies': allergies, 'conditions': conditions};
    final res = id == null ? await dio.post('/health-profile/members', data: body) : await dio.put('/health-profile/members/$id', data: body);
    return HealthProfile.fromJson(apiData(res));
  }

  Future<HealthProfile> removeFamilyMember(String id) async =>
      HealthProfile.fromJson(apiData(await dio.delete('/health-profile/members/$id')));
}
