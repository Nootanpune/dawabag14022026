import '../models/medicine_info.dart';
import '../models/product_page_extras.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Product page extras (Sprint 33): medicine information, substitutes, the
/// estimated delivery date and the trust pages. Read from the server on every
/// visit; nothing is cached on the phone.
extension ProductPageApi on ApiService {
  /// GET /medicines/:id/info — approved version only (C-19)
  Future<MedicineInfo> getMedicineInfo(String productId) async =>
      MedicineInfo.fromJson(apiData(await dio.get('/medicines/$productId/info')));

  /// GET /medicines/:id/substitutes?limit=
  Future<SubstitutesResult> getSubstitutes(String productId, {int? limit}) async => SubstitutesResult.fromJson(
      apiData(await dio.get('/medicines/$productId/substitutes', queryParameters: {if (limit != null) 'limit': limit})));

  /// GET /medicines/:id/delivery?pincode= — without a PIN the server uses the saved default address
  Future<DeliveryEstimate> getDeliveryEstimate(String productId, {String? pincode}) async => DeliveryEstimate.fromJson(
      apiData(await dio.get('/medicines/$productId/delivery', queryParameters: {if (pincode != null && pincode.isNotEmpty) 'pincode': pincode})));

  /// GET /info-pages/:key
  Future<InfoPage> getInfoPage(String key) async => InfoPage.fromJson(apiData(await dio.get('/info-pages/$key')));
}
