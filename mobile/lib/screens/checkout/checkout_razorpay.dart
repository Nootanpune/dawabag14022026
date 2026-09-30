import 'package:razorpay_flutter/razorpay_flutter.dart';

/// Wraps the Razorpay checkout sheet for the checkout screen. The payment is
/// verified by the server (POST /payments/verify); nothing is kept locally.
class CheckoutRazorpay {
  final Razorpay _razorpay = Razorpay();

  CheckoutRazorpay({
    required void Function(PaymentSuccessResponse) onSuccess,
    required void Function(PaymentFailureResponse) onError,
  }) {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, onError);
  }

  /// Opens the sheet for the server's payment order
  /// (POST /payments/create-order → [paymentOrder]).
  void open(Map<String, dynamic> paymentOrder, {String? orderNumber}) {
    _razorpay.open({
      'key': paymentOrder['razorpay_key_id'],
      'amount': paymentOrder['amount'],
      'currency': 'INR',
      'name': 'Dawabag',
      'description': 'Order $orderNumber',
      'order_id': paymentOrder['razorpay_order_id'],
      'prefill': {'contact': '', 'email': ''},
      'theme': {'color': '#1A8856'},
    });
  }

  void dispose() => _razorpay.clear();
}
