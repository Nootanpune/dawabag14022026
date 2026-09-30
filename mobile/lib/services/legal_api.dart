import '../models/legal_info.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Statutory disclosures (C-04). Public endpoint; nothing is cached.
extension LegalApi on ApiService {
  /// GET /legal/info
  Future<LegalInfo> getLegalInfo() async {
    final res = await dio.get('/legal/info');
    return LegalInfo.fromJson(apiData(res));
  }
}
