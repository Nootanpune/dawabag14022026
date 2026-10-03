import '../models/checkout_summary.dart';
import '../models/json_utils.dart';
import '../models/payment_result.dart';
import 'api_service.dart';
import 'api_utils.dart';
import '../utils/prescription_status.dart';

/// Checkout requests (order placement, prescription upload or saved-
/// prescription reuse, Razorpay).
/// The server computes prices and totals; nothing is cached on the device.
extension CheckoutApi on ApiService {
  /// GET /prescriptions/my → the buyer's prescriptions that can be offered for
  /// an order: verified and still valid today, or uploaded on the
  /// Prescriptions screen and not yet checked (Sprint 25). The server
  /// re-checks on use and the pharmacist checks it with the order (C-08).
  Future<List<Map<String, dynamic>>> getVerifiedPrescriptions() async {
    final res = await dio.get('/prescriptions/my');
    final body = res.data;
    final list = body is Map ? asMapList(body['data']) : const <Map<String, dynamic>>[];
    return list.where(isUsableSavedPrescription).toList();
  }

  /// See [isUsableAtCheckout] (utils/prescription_status.dart).
  static bool isUsableSavedPrescription(Map<String, dynamic> rx) => isUsableAtCheckout(rx);

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
    String? prescriptionId,
  }) =>
      {
        'address_id': addressId,
        'items': items,
        if (couponCode != null) 'coupon_code': couponCode,
        'pincode': pincode,
        if (practitionerDeclaration != null) 'practitioner_declaration': practitionerDeclaration,
        // Sprint 39: the prescription goes WITH the order, chosen before payment (C-08)
        if (prescriptionId != null) 'prescription_id': prescriptionId,
      };

  /// POST /orders/preview (same body as POST /orders) → the checkout summary
  /// the buyer reviews before paying (C-35). The server rolls the order back.
  Future<CheckoutSummary> previewOrder(Map<String, dynamic> body) async {
    final res = await dio.post('/orders/preview', data: body);
    return CheckoutSummary.fromJson(apiData(res));
  }

  /// POST /orders [body] → the `order` object (id, order_number,
  /// total_paise, requires_prescription, shipments; Sprint 39: prescription,
  /// capture). A prescription order without `prescription_id` is refused
  /// (422 PRESCRIPTION_REQUIRED) and nothing is placed.
  Future<Map<String, dynamic>> placeOrder(Map<String, dynamic> body) async {
    final res = await dio.post('/orders', data: body);
    final order = apiData(res)['order'];
    return order is Map ? Map<String, dynamic>.from(order) : <String, dynamic>{};
  }

  /// POST /payments/create-order { order_id } → razorpay_key_id, amount,
  /// razorpay_order_id; Sprint 39: capture ('now' | 'after_pharmacist_check')
  /// and charge_note. The server creates the Razorpay order with the capture
  /// setting, so the app passes nothing about capture. 422
  /// PRESCRIPTION_REQUIRED while the order has no prescription with it.
  Future<Map<String, dynamic>> createPaymentOrder(String orderId) async {
    final res = await dio.post('/payments/create-order', data: {'order_id': orderId});
    return Map<String, dynamic>.from(res.data['data'] as Map);
  }

  /// POST /payments/verify — the server checks the Razorpay signature. Sprint 39:
  /// `payment_status` 'authorized' = held until the pharmacist's check (C-37).
  Future<PaymentResult> verifyPayment({
    required String? razorpayOrderId,
    required String? razorpayPaymentId,
    required String? razorpaySignature,
    required String? orderId,
  }) async {
    final res = await dio.post('/payments/verify', data: {
      'razorpay_order_id': razorpayOrderId,
      'razorpay_payment_id': razorpayPaymentId,
      'razorpay_signature': razorpaySignature,
      'order_id': orderId,
    });
    return PaymentResult.fromVerify(apiData(res));
  }
}
