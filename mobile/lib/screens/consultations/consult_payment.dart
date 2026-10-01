import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../services/consultation_api.dart';
import '../../services/api_service.dart';
import '../../utils/consult_format.dart';

/// Razorpay payment for a consultation fee, wired the same way as the order
/// checkout (CheckoutRazorpay): POST /consultations/:id/pay, the Razorpay
/// sheet, then POST /consultations/:id/pay/verify (the server checks the
/// signature). Nothing is kept locally; the server's consultation is the
/// record and the screen reloads from it.
class ConsultPayment {
  final Razorpay _razorpay = Razorpay();
  final void Function() onPaid;
  final void Function(String message) onError;
  final void Function(bool busy) onBusy;
  String? _consultationId;

  ConsultPayment({required this.onPaid, required this.onError, required this.onBusy}) {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onFailure);
  }

  /// Creates (or reuses) the server's Razorpay order and opens the sheet.
  Future<void> pay(String consultationId, {String? doctorName}) async {
    _consultationId = consultationId;
    onBusy(true);
    try {
      final order = await apiService.startConsultationPayment(consultationId);
      final key = order.keyId;
      if (key == null || key.isEmpty || order.gatewayOrderId.isEmpty) {
        onError('Online payment is not available right now. Please try again later.');
        return;
      }
      _razorpay.open({
        'key': key,
        'amount': order.amountPaise,
        'currency': 'INR',
        'name': 'Dawabag',
        'description': doctorName != null && doctorName.isNotEmpty
            ? 'Consultation with $doctorName'
            : 'Doctor consultation',
        'order_id': order.gatewayOrderId,
        'prefill': {'contact': '', 'email': ''},
        'theme': {'color': '#1A8856'},
      });
    } catch (e) {
      onError(consultErrorMessage(e, fallback: 'Payment error'));
    } finally {
      onBusy(false);
    }
  }

  Future<void> _onSuccess(PaymentSuccessResponse response) async {
    final id = _consultationId;
    if (id == null) return;
    try {
      await apiService.verifyConsultationPayment(
        id,
        razorpayOrderId: response.orderId,
        razorpayPaymentId: response.paymentId,
        razorpaySignature: response.signature,
      );
      onPaid();
    } catch (e) {
      onError(ApiService.errorMessage(e,
          fallback: 'Payment verification failed. Contact support.'));
    }
  }

  void _onFailure(PaymentFailureResponse response) =>
      onError('Payment failed: ${response.message}');

  void dispose() => _razorpay.clear();
}
