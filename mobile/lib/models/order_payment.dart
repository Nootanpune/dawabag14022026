import '../utils/ist.dart';
import '../utils/payment_hold.dart';
import 'json_utils.dart';

/// The `payment` block of GET /orders/:id (Sprint 39): how the order's payment
/// stands — a prescription order is held (authorised) until the pharmacist's
/// check, then charged, or released if it cannot be supplied (C-08, C-37).
class OrderPayment {
  /// created | authorized | captured | released | failed | refunded …
  final String status;
  /// 'now' | 'after_pharmacist_check'
  final String capture;
  final String? authorisedAt;
  final String? capturedAt;
  final String? releasedAt;
  /// The server's own words, when it has them
  final String? note;

  const OrderPayment({
    required this.status,
    this.capture = kCaptureNow,
    this.authorisedAt,
    this.capturedAt,
    this.releasedAt,
    this.note,
  });

  /// null when the order has no payment yet (or the server sent none).
  static OrderPayment? fromOrder(Map<String, dynamic> order) {
    final p = order['payment'];
    if (p is! Map) return null;
    final j = Map<String, dynamic>.from(p);
    return OrderPayment(
      status: asString(j['status']) ?? '',
      capture: asString(j['capture']) ?? kCaptureNow,
      authorisedAt: asString(j['authorised_at']),
      capturedAt: asString(j['captured_at']),
      releasedAt: asString(j['released_at']),
      note: asString(j['note'])?.trim(),
    );
  }

  bool get afterCheck => capturesAfterCheck(capture);
  bool get held => status == 'authorized';
  bool get released => status == 'released';
  bool get charged => status == 'captured';

  /// What the buyer reads, or null when there is nothing to say about a hold
  /// (an ordinary payment taken at checkout is shown on the bill as before).
  ({String title, String? detail, bool attention})? describe() {
    if (held) {
      return (
        title: "Amount held — you'll be charged after the pharmacist check",
        detail: '${chargeNoteOr(note)} If your order cannot be supplied, the hold is released and you are not charged.',
        attention: true,
      );
    }
    if (released) {
      return (
        title: 'Hold released — you were not charged',
        detail: (note != null && note!.isNotEmpty) ? note : null,
        attention: false,
      );
    }
    if (charged && afterCheck) {
      return (
        title: capturedAt != null ? 'Charged on ${formatDateTimeIst(capturedAt)}' : 'Charged after the pharmacist check',
        detail: 'Our pharmacist checked your prescription, so the amount held was taken.',
        attention: false,
      );
    }
    return null;
  }
}
