import '../models/sales_status.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Sprint 38: GET /sales-status (public) — is the emergency stop on? (C-08)
extension SalesStatusApi on ApiService {
  Future<SalesStatus> getSalesStatus() async => SalesStatus.fromJson(apiData(await dio.get('/sales-status')));
}
