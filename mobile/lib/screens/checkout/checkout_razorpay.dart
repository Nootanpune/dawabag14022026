import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../services/api_service.dart';
import '../../services/checkout_api.dart';

/// Razorpay payment for a placed order: POST /payments/create-order, the
/// Razorpay sheet, then POST /payments/verify (the server checks the
/// signature). Nothing is kept locally; the server's order is the record.
class CheckoutRazorpay {
  final Razorpay _razorpay = Razorpay();
  final void Function() onPaid;
  final void Function(String message) onError;
  final void Function(bool busy) onBusy;
  String? _orderId;

  CheckoutRazorpay({required this.onPaid, required this.onError, required this.onBusy}) {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onFailure);
  }

  /// Creates the server's payment order and opens the Razorpay sheet.
  Future<void> pay(String orderId, {String? orderNumber}) async {
    _orderId = orderId;
    onBusy(true);
    try {
      final paymentOrder = await apiService.createPaymentOrder(orderId);
      _razorpay.open({
        'key': paymentOrder['razorpay_key_id'],
        'amount': paymentOrder['amount'],
        'currency': 'INR',
        'name': 'Dawabag',
        'description': 'Order $orderNumber',
        'order_id': paymentOrder['razorpay_order_id'],
        'prefill': {'contact': '', 'email': ''},
        'theme': {'color': '#167A4C'},
      });
    } catch (e) {
      onError(ApiService.errorMessage(e, fallback: 'We could not start the payment. Please try again in a minute.'));
    } finally {
      onBusy(false);
    }
  }

  Future<void> _onSuccess(PaymentSuccessResponse response) async {
    try {
      await apiService.verifyPayment(
        razorpayOrderId: response.orderId,
        razorpayPaymentId: response.paymentId,
        razorpaySignature: response.signature,
        orderId: _orderId,
      );
      onPaid();
    } catch (_) {
      onError('We received your payment but could not confirm it yet. Please do not pay again — check My orders in a few minutes.');
    }
  }

  void _onFailure(PaymentFailureResponse response) => onError(response.code == Razorpay.PAYMENT_CANCELLED
      ? 'Payment window closed. Nothing was charged. Tap Pay when you are ready.'
      : 'Your payment did not go through. No money was taken; please try again.');

  void dispose() => _razorpay.clear();
}
