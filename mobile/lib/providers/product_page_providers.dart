import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/medicine_info.dart';
import '../models/product_page_extras.dart';
import '../services/api_service.dart';
import '../services/product_page_api.dart';

/// Product page extras (Sprint 33). autoDispose: fetched each time the page
/// shows and dropped when it leaves — the server holds the only copy.
final medicineInfoProvider = FutureProvider.autoDispose.family<MedicineInfo, String>(
    (ref, productId) => apiService.getMedicineInfo(productId));

/// (productId, limit) — limit null = the full list
final substitutesProvider = FutureProvider.autoDispose.family<SubstitutesResult, (String, int?)>(
    (ref, key) => apiService.getSubstitutes(key.$1, limit: key.$2));

/// (productId, pincode) — pincode '' = the saved default address, if signed in
final deliveryEstimateProvider = FutureProvider.autoDispose.family<DeliveryEstimate, (String, String)>(
    (ref, key) => apiService.getDeliveryEstimate(key.$1, pincode: key.$2));

final infoPageProvider = FutureProvider.autoDispose.family<InfoPage, String>((ref, key) => apiService.getInfoPage(key));
