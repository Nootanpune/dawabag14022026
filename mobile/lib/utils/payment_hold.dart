// Sprint 39 (owner decision 2026-10-03; Rulebook C-08, C-37): an order with
// prescription medicines is only AUTHORISED at checkout — the amount is held on
// the buyer's card or UPI — and charged only when our pharmacist's check passes.
// If the order cannot be supplied the hold is released: the buyer is never
// charged. The server sends the words where it has them (`charge_note`,
// `payment.note`); these are the same words for when it does not.

/// The checkout's line (backend HOLD_WORDING.checkout).
const kChargeAfterCheckNote = "You'll only be charged after our pharmacist checks your prescription.";

/// Capture modes the server reports (`capture`).
const kCaptureNow = 'now';
const kCaptureAfterCheck = 'after_pharmacist_check';

/// True when the payment is taken only after the pharmacist's check.
bool capturesAfterCheck(Object? capture) => capture?.toString() == kCaptureAfterCheck;

/// The server's note, or the standard line when it sent none.
String chargeNoteOr(String? serverNote) {
  final s = serverNote?.trim();
  return (s == null || s.isEmpty) ? kChargeAfterCheckNote : s;
}
