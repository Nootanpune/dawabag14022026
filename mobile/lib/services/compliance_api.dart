import '../models/adverse_event.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Side-effect reports (C-29). Sent to the server only; nothing is kept on
/// the device.
extension ComplianceApi on ApiService {
  /// POST /compliance/adverse-events → { id, report_no, status, created_at }
  Future<Map<String, dynamic>> createAdverseEvent(Map<String, dynamic> body) async {
    final res = await dio.post('/compliance/adverse-events', data: body);
    return apiData(res);
  }

  /// GET /compliance/adverse-events → the buyer's own reports
  Future<List<AdverseEventReport>> getAdverseEvents() async {
    final res = await dio.get('/compliance/adverse-events');
    return AdverseEventReport.listFrom(apiData(res)['reports']);
  }
}
