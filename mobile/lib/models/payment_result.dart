import 'json_utils.dart';

/// The server's answer to POST /payments/verify or POST /payments/demo
/// (Sprint 39): whether the order is paid, and whether the money was taken
/// (`captured`) or only held until the pharmacist's check (`authorized`, C-37).
/// Held in memory for the confirmation screen only; the server's order is the record.
class PaymentResult {
  final bool paid;
  /// 'authorized' | 'captured' (null from a server before Sprint 39)
  final String? paymentStatus;
  /// e.g. "You'll only be charged after our pharmacist checks your prescription."
  final String? chargeNote;

  const PaymentResult({required this.paid, this.paymentStatus, this.chargeNote});

  /// Held, not charged, until the pharmacist's check.
  bool get authorised => paid && paymentStatus == 'authorized';

  /// POST /payments/verify answers only when the payment is good, so it is paid.
  factory PaymentResult.fromVerify(Map<String, dynamic> j) =>
      PaymentResult(paid: true, paymentStatus: asString(j['payment_status']), chargeNote: asString(j['charge_note']));

  /// POST /payments/demo: `paid` false when the (simulated) payment was declined.
  factory PaymentResult.fromDemo(Map<String, dynamic> j) =>
      PaymentResult(paid: j['paid'] == true, paymentStatus: asString(j['payment_status']), chargeNote: asString(j['charge_note']));
}
