import '../models/doctor_consultation.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// The doctor's side of teleconsultations (Mobile Sprint 15; C-22, C-23).
/// Every call goes to the server, which checks that the signed-in account is
/// the consultation's own verified doctor. Joining the call uses the shared
/// [ConsultationApi.joinConsultation]. Writing the e-prescription stays on the
/// website (no prescribing in the app).
extension DoctorConsultationApi on ApiService {
  /// GET /consultations/doctor?date=YYYY-MM-DD → that day's consultations
  /// (not cancelled), earliest slot first.
  Future<List<DoctorConsultation>> getDoctorConsultations(String date) async {
    final res = await dio.get('/consultations/doctor', queryParameters: {'date': date});
    return apiDataList(res).map(DoctorConsultation.fromJson).toList();
  }

  /// POST /consultations/:id/end { notes? (≤ 5000) } → { id, status: 'completed' }.
  /// 404 unless the consultation is this doctor's and in progress.
  Future<Map<String, dynamic>> endConsultation(String id, {String? notes}) async {
    final res = await dio.post('/consultations/$id/end', data: {
      if (notes != null && notes.trim().isNotEmpty) 'notes': notes.trim(),
    });
    return apiData(res);
  }
}
