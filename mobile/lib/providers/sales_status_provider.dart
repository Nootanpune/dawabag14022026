import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/sales_status.dart';
import '../services/api_service.dart';
import '../services/sales_status_api.dart';

/// Sprint 38: whether prescription-medicine sales are paused (emergency stop).
/// autoDispose, so every screen that shows the banner asks the server again —
/// nothing is kept on the phone. Guests may ask too (public endpoint).
final salesStatusProvider = FutureProvider.autoDispose<SalesStatus>((ref) => apiService.getSalesStatus());
