import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../../models/refill.dart';
import '../../../services/api_service.dart';
import '../../../services/refill_api.dart';

/// Per-charge limit for automatic refill payments (contract section D:
/// "Max ₹15,000 per charge"; the server enforces it too).
const int kMaxAutoChargePaise = 15000 * 100;

/// Owns the Razorpay Checkout instance used to authorise a recurring-payment
/// mandate. Nothing is stored on the device: the mandate turns active on the
/// server once Razorpay confirms it, and the screen reloads from the server.
class MandateCheckout {
  final Razorpay _razorpay = Razorpay();

  MandateCheckout({
    required void Function(PaymentSuccessResponse) onSuccess,
    required void Function(PaymentFailureResponse) onError,
  }) {
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, onSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, onError);
  }

  /// Opens Razorpay Checkout in recurring mode with the server's values.
  /// Returns false when the server did not send a key (cannot open).
  bool open(MandateStart start) {
    final key = start.keyId;
    if (key == null || key.isEmpty || start.razorpayOrderId.isEmpty) return false;
    _razorpay.open({
      'key': key,
      'order_id': start.razorpayOrderId,
      if (start.customerId != null) 'customer_id': start.customerId,
      'recurring': start.recurring,
      'name': 'Dawabag',
      'description': 'Automatic payment for refills',
      'theme': {'color': '#167A4C'},
    });
    return true;
  }

  void dispose() => _razorpay.clear();
}

/// Result of POST /refills/mandates.
sealed class MandateStartResult {
  const MandateStartResult();
}

class MandateStarted extends MandateStartResult {
  final MandateStart start;
  const MandateStarted(this.start);
}

class MandateUnavailable extends MandateStartResult {
  const MandateUnavailable();
}

class MandateFailed extends MandateStartResult {
  final String message;
  const MandateFailed(this.message);
}

/// POST /refills/mandates { max_amount_paise, method:'upi' }. HTTP 503 means
/// online payments are not configured on the server yet.
Future<MandateStartResult> requestMandate(int maxAmountPaise) async {
  try {
    final start = await apiService.startMandate(maxAmountPaise, method: 'upi');
    return MandateStarted(start);
  } on DioException catch (e) {
    if (e.response?.statusCode == 503) return const MandateUnavailable();
    return MandateFailed(ApiService.errorMessage(e, fallback: 'Could not start automatic payment'));
  } catch (e) {
    return MandateFailed(ApiService.errorMessage(e, fallback: 'Could not start automatic payment'));
  }
}

/// Asks for the most a single automatic refill charge may be (whole rupees,
/// up to ₹15,000). Returns paise, or null when cancelled.
Future<int?> askMandateLimit(BuildContext context) =>
    showDialog<int>(context: context, builder: (_) => const _MandateLimitDialog());

class _MandateLimitDialog extends StatefulWidget {
  const _MandateLimitDialog();

  @override
  State<_MandateLimitDialog> createState() => _MandateLimitDialogState();
}

class _MandateLimitDialogState extends State<_MandateLimitDialog> {
  final TextEditingController _controller = TextEditingController(text: '5000');
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    final rupees = int.tryParse(_controller.text.trim());
    if (rupees == null || rupees < 1 || rupees * 100 > kMaxAutoChargePaise) {
      setState(() => _error = 'Enter an amount from ₹1 to ₹15,000');
      return;
    }
    Navigator.pop(context, rupees * 100);
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Turn on automatic payment'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Pay for refills automatically with UPI. Set the most we may charge for one refill '
              '(up to ₹15,000). Prescription medicines are checked by our pharmacist before any charge.',
              style: TextStyle(fontSize: 13),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _controller,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              decoration: InputDecoration(
                labelText: 'Maximum per refill',
                prefixText: '₹ ',
                errorText: _error,
              ),
              onChanged: (_) => setState(() => _error = null),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          TextButton(onPressed: _submit, child: const Text('Continue')),
        ],
      );
}
