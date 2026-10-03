import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../models/payment_result.dart';
import '../../services/api_service.dart';
import '../../services/checkout_api.dart';

/// Razorpay payment for a placed order: POST /payments/create-order, the
/// Razorpay sheet, then POST /payments/verify (the server checks the
/// signature). Nothing is kept locally; the server's order is the record.
///
/// Sprint 39 (C-37): the SERVER creates the Razorpay order with its capture
/// setting — manual capture for a prescription order, so the money is only
/// held until the pharmacist's check. The sheet is opened with that order id
/// and its amount only; the app sends nothing about capture, so nothing here
/// can override it.
class CheckoutRazorpay {
  final Razorpay _razorpay = Razorpay();
  final void Function(PaymentResult result) onPaid;
  /// [error] is the API error when there is one (e.g. 422 PRESCRIPTION_REQUIRED)
  final void Function(String message, [Object? error]) onError;
  final void Function(bool busy) onBusy;
  /// The server's `charge_note` from create-order, when the amount is only held
  final void Function(String note)? onChargeNote;
  String? _orderId;

  CheckoutRazorpay({required this.onPaid, required this.onError, required this.onBusy, this.onChargeNote}) {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onFailure);
  }

  /// The options the Razorpay sheet is opened with (no capture setting: the
  /// server's order decides it).
  static Map<String, dynamic> sheetOptions(Map<String, dynamic> paymentOrder, {String? orderNumber}) => {
        'key': paymentOrder['razorpay_key_id'],
        'amount': paymentOrder['amount'],
        'currency': 'INR',
        'name': 'Dawabag',
        'description': 'Order ${orderNumber ?? paymentOrder['order_number'] ?? ''}'.trim(),
        'order_id': paymentOrder['razorpay_order_id'],
        'prefill': {'contact': '', 'email': ''},
        'theme': {'color': '#027A86'}, // brand teal
      };

  /// Creates the server's payment order and opens the Razorpay sheet.
  /// Sprint 44: [orderEditId] pays the difference for an order change.
  Future<void> pay(String orderId, {String? orderNumber, String? orderEditId}) async {
    _orderId = orderId;
    onBusy(true);
    try {
      final paymentOrder = await apiService.createPaymentOrder(orderId, orderEditId: orderEditId);
      final note = paymentOrder['charge_note']?.toString().trim();
      if (note != null && note.isNotEmpty) onChargeNote?.call(note);
      _razorpay.open(sheetOptions(paymentOrder, orderNumber: orderNumber));
    } catch (e) {
      onError(ApiService.errorMessage(e, fallback: 'We could not start the payment. Please try again in a minute.'), e);
    } finally {
      onBusy(false);
    }
  }

  Future<void> _onSuccess(PaymentSuccessResponse response) async {
    try {
      final result = await apiService.verifyPayment(
        razorpayOrderId: response.orderId,
        razorpayPaymentId: response.paymentId,
        razorpaySignature: response.signature,
        orderId: _orderId,
      );
      onPaid(result);
    } catch (_) {
      onError('We received your payment but could not confirm it yet. Please do not pay again — check My orders in a few minutes.');
    }
  }

  void _onFailure(PaymentFailureResponse response) => onError(response.code == Razorpay.PAYMENT_CANCELLED
      ? 'Payment window closed. Nothing was charged. Tap Pay when you are ready.'
      : 'Your payment did not go through. No money was taken; please try again.');

  void dispose() => _razorpay.clear();
}
