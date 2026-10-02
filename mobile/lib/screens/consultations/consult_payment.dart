import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../services/consultation_api.dart';
import '../../services/api_service.dart';
import '../../services/payment_api.dart';
import '../../utils/consult_format.dart';
import '../../widgets/payments/demo_checkout/demo_checkout.dart';

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
  /// The trial's demo checkout (Sprint 27): shows the steps for [feePaise] and
  /// records the answer with [pay]; the choice once paid, null when closed.
  final Future<DemoChoice?> Function(PaymentOptions options, int feePaise, DemoPay pay)? chooseDemo;
  String? _consultationId;

  ConsultPayment({required this.onPaid, required this.onError, required this.onBusy, this.chooseDemo}) {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onFailure);
  }

  /// Creates (or reuses) the server's Razorpay order and opens the sheet.
  Future<void> pay(String consultationId, {String? doctorName, int feePaise = 0}) async {
    _consultationId = consultationId;
    final options = await apiService.getPaymentOptions();
    if (options.isDemo) return _payDemo(consultationId, options, feePaise);
    if (!options.isRazorpay) {
      onError('Online payment is not available right now. Please try again later.');
      return;
    }
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
        'theme': {'color': '#167A4C'},
      });
    } catch (e) {
      onError(consultErrorMessage(e, fallback: 'Payment error'));
    } finally {
      onBusy(false);
    }
  }

  /// Trial server without Razorpay keys: the demo checkout, no money moves. A
  /// decline is shown inside the sheet (Try again); request errors there too.
  Future<void> _payDemo(String consultationId, PaymentOptions options, int feePaise) async {
    final choice = await chooseDemo?.call(options, feePaise, (c, success) =>
        apiService.payConsultationDemo(consultationId, method: c.method, provider: c.provider, fail: !success));
    if (choice != null) onPaid();
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

  void _onFailure(PaymentFailureResponse response) => onError(response.code == Razorpay.PAYMENT_CANCELLED
      ? 'Payment window closed. Nothing was charged.'
      : 'Your payment did not go through. No money was taken; please try again.');

  void dispose() => _razorpay.clear();
}
