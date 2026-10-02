import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../services/consultation_api.dart';
import '../../services/api_service.dart';
import '../../services/payment_api.dart';
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
  /// The trial's demo payment (Sprint 26): asks how to pay; null when closed.
  final Future<({String method, bool success})?> Function()? chooseDemo;
  String? _consultationId;

  ConsultPayment({required this.onPaid, required this.onError, required this.onBusy, this.chooseDemo}) {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onFailure);
  }

  /// Creates (or reuses) the server's Razorpay order and opens the sheet.
  Future<void> pay(String consultationId, {String? doctorName}) async {
    _consultationId = consultationId;
    final options = await apiService.getPaymentOptions();
    if (options.isDemo) return _payDemo(consultationId);
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

  /// Trial server without Razorpay keys: a labelled demo payment, no money moves.
  Future<void> _payDemo(String consultationId) async {
    final choice = await chooseDemo?.call();
    if (choice == null) return;
    onBusy(true);
    try {
      final paid = await apiService.payConsultationDemo(consultationId, method: choice.method, fail: !choice.success);
      if (paid) {
        onPaid();
      } else {
        onError('Demo payment failed (simulated). No money was taken; you can try again.');
      }
    } catch (e) {
      onError(ApiService.errorMessage(e, fallback: 'We could not record the demo payment. Please try again.'));
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

  void _onFailure(PaymentFailureResponse response) => onError(response.code == Razorpay.PAYMENT_CANCELLED
      ? 'Payment window closed. Nothing was charged.'
      : 'Your payment did not go through. No money was taken; please try again.');

  void dispose() => _razorpay.clear();
}
