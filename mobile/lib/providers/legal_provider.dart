import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/legal_info.dart';
import '../services/api_service.dart';
import '../services/legal_api.dart';

/// GET /legal/info (public, C-04). Fetched each time the screen opens.
final legalInfoProvider = FutureProvider.autoDispose<LegalInfo>((ref) {
  return apiService.getLegalInfo();
});
