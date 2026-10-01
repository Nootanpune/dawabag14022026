import 'package:dio/dio.dart';

import '../models/checkout_summary.dart';
import '../models/json_utils.dart';
import 'api_service.dart';
import 'api_utils.dart';
import '../utils/ist.dart';

/// Checkout requests (order placement, prescription upload or saved-
/// prescription reuse, Razorpay).
/// The server computes prices and totals; nothing is cached on the device.
extension CheckoutApi on ApiService {
  /// GET /prescriptions/my → only the buyer's prescriptions a pharmacist has
  /// verified and that are still valid today, the only ones that can be
  /// offered for an order (C-08). The server re-checks both on use.
  Future<List<Map<String, dynamic>>> getVerifiedPrescriptions() async {
    final res = await dio.get('/prescriptions/my');
    final body = res.data;
    final list = body is Map ? asMapList(body['data']) : const <Map<String, dynamic>>[];
    return list.where(isUsableSavedPrescription).toList();
  }

  /// True for a verified prescription whose valid_until is today or later
  /// (compared as an India calendar date). No date counts as expired, as on
  /// the server (C-08).
  static bool isUsableSavedPrescription(Map<String, dynamic> rx) {
    if (rx['status'] != 'verified') return false;
    return isOnOrAfterTodayIst(rx['valid_until']);
  }

  /// POST /prescriptions/:id/use-for-order { order_id } — offers a saved,
  /// verified prescription for [orderId]; a pharmacist still confirms it
  /// (C-08). Returns { order_id, prescription_id, status:'awaiting_pharmacist' }.
  /// A 400 explains an expired prescription or the products it does not cover.
  Future<Map<String, dynamic>> useSavedPrescriptionForOrder({
    required String prescriptionId,
    required String orderId,
  }) async {
    final res = await dio.post(
      '/prescriptions/${Uri.encodeComponent(prescriptionId)}/use-for-order',
      data: {'order_id': orderId},
    );
    return apiData(res);
  }

  /// Body shared by POST /orders/preview and POST /orders. Doctors and
  /// hospitals send [practitionerDeclaration] true on every order (C-15).
  static Map<String, dynamic> orderBody({
    required Object? addressId,
    required List<Map<String, dynamic>> items,
    String? couponCode,
    required String pincode,
    bool? practitionerDeclaration,
  }) =>
      {
        'address_id': addressId,
        'items': items,
        if (couponCode != null) 'coupon_code': couponCode,
        'pincode': pincode,
        if (practitionerDeclaration != null) 'practitioner_declaration': practitionerDeclaration,
      };

  /// POST /orders/preview (same body as POST /orders) → the checkout summary
  /// the buyer reviews before paying (C-35). The server rolls the order back.
  Future<CheckoutSummary> previewOrder(Map<String, dynamic> body) async {
    final res = await dio.post('/orders/preview', data: body);
    return CheckoutSummary.fromJson(apiData(res));
  }

  /// POST /orders [body] → the `order` object (id, order_number,
  /// total_paise, requires_prescription, shipments).
  Future<Map<String, dynamic>> placeOrder(Map<String, dynamic> body) async {
    final res = await dio.post('/orders', data: body);
    final order = apiData(res)['order'];
    return order is Map ? Map<String, dynamic>.from(order) : <String, dynamic>{};
  }

  /// POST /prescriptions/upload (multipart) — the file goes straight to the
  /// server's object store; the app keeps no copy (C-41).
  Future<void> uploadOrderPrescription({
    required String filePath,
    required String filename,
    required String orderId,
  }) async {
    final formData = FormData.fromMap({
      'prescription': await MultipartFile.fromFile(filePath, filename: filename),
      'order_id': orderId,
    });
    await dio.post('/prescriptions/upload', data: formData);
  }

  /// POST /payments/create-order { order_id } → razorpay_key_id, amount,
  /// razorpay_order_id.
  Future<Map<String, dynamic>> createPaymentOrder(String orderId) async {
    final res = await dio.post('/payments/create-order', data: {'order_id': orderId});
    return Map<String, dynamic>.from(res.data['data'] as Map);
  }

  /// POST /payments/verify — the server checks the Razorpay signature.
  Future<void> verifyPayment({
    required String? razorpayOrderId,
    required String? razorpayPaymentId,
    required String? razorpaySignature,
    required String? orderId,
  }) async {
    await dio.post('/payments/verify', data: {
      'razorpay_order_id': razorpayOrderId,
      'razorpay_payment_id': razorpayPaymentId,
      'razorpay_signature': razorpaySignature,
      'order_id': orderId,
    });
  }
}
