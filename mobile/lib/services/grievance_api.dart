import '../models/grievance.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Buyer complaints (C-36). Nothing is cached on the device; callers reload
/// from the server after each call.
extension GrievanceApi on ApiService {
  /// GET /grievances
  Future<List<Grievance>> getGrievances() async {
    final res = await dio.get('/grievances');
    return Grievance.listFrom(apiData(res));
  }

  /// POST /grievances { category, subject (3–200), description (10–5000),
  /// order_id? } → { id, ticket_no, status, created_at }
  Future<Map<String, dynamic>> createGrievance({
    required String category,
    required String subject,
    required String description,
    String? orderId,
  }) async {
    final res = await dio.post('/grievances', data: {
      'category': category,
      'subject': subject,
      'description': description,
      if (orderId != null && orderId.isNotEmpty) 'order_id': orderId,
    });
    return apiData(res);
  }

  /// GET /grievances/:id (with resolution + messages)
  Future<Grievance> getGrievance(String id) async {
    final res = await dio.get('/grievances/$id');
    return Grievance.fromJson(apiData(res));
  }

  /// POST /grievances/:id/messages { body } → the updated complaint
  Future<Grievance> postGrievanceMessage(String id, String body) async {
    final res = await dio.post('/grievances/$id/messages', data: {'body': body});
    return Grievance.fromJson(apiData(res));
  }
}
