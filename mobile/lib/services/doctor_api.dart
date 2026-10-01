import '../models/doctor.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Page size of GET /doctors (fixed on the server).
const int kDoctorPageSize = 20;

/// Public doctor directory (C-22): only verified doctors, always with their
/// council registration. Nothing is cached on the device.
extension DoctorApi on ApiService {
  /// GET /doctors?speciality&page → [doctor]
  Future<List<Doctor>> getDoctors({String? speciality, int page = 1}) async {
    final res = await dio.get('/doctors', queryParameters: {
      if (speciality != null && speciality.isNotEmpty) 'speciality': speciality,
      'page': page,
    });
    return apiDataList(res).map(Doctor.fromJson).toList();
  }

  /// GET /doctors/:id
  Future<Doctor> getDoctor(String id) async {
    final res = await dio.get('/doctors/$id');
    return Doctor.fromJson(apiData(res));
  }

  /// GET /doctors/:id/slots?date=YYYY-MM-DD → open slots that day
  Future<List<DoctorSlot>> getDoctorSlots(String id, String date) async {
    final res = await dio.get('/doctors/$id/slots', queryParameters: {'date': date});
    return apiDataList(res).map(DoctorSlot.fromJson).toList();
  }
}
