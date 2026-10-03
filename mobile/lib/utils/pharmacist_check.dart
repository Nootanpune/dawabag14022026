// The pharmacist check on every order (Sprint 35, owner decision 2026-10-02,
// Rulebook C-08 / C-46), read from GET /orders/:id. Pure logic so the
// timeline, the header and each shipment say the same thing.
//
// Server shape: the order carries `pharmacist_check` (the buyer's summary:
// pending / held / released / rejected / not_recorded) and each shipment its own
// `pharmacist_check`, `pharmacist_name`, `pharmacist_reg_no` and
// `pharmacist_checked_at`. For a hold the server leaves out the pharmacist's name
// and note (the pharmacist will contact the buyer); a refusal names the
// pharmacist, and the order's `cancellation_reason` carries the reason.

import '../models/json_utils.dart';
import 'ist.dart';

/// The check states the server sends (backend services/pharmacistCheck/rules.ts).
class CheckState {
  CheckState._();
  static const pending = 'pending';
  static const held = 'held';
  static const released = 'released';
  static const rejected = 'rejected';

  /// Packed before Sprint 35: nothing was recorded, the parcel may still go out.
  static const notRecorded = 'not_recorded';
}

/// Order statuses in which the pharmacist is (or may be) checking the order.
const List<String> kCheckingStatuses = ['confirmed', 'rx_verified', 'packing'];

/// Prefix the server puts on the cancellation reason of a refused order
/// (check.service.ts: "Not supplied after the pharmacist's check: <reason>").
const String kRefusalReasonPrefix = "Not supplied after the pharmacist's check:";

// ── Customer wording (plain English; matches the website's meaning) ──────────
const String kCheckStepLabel = 'Pharmacist check';
const String kCheckingNote = 'A registered pharmacist checks every order before it is packed.';
const String kHeldTitle = 'On hold — our pharmacist needs to talk to you';
const String kHeldText = 'Our pharmacist will contact you about this order before it is packed. '
    'Nothing more is charged while it is on hold.';
const String kHeldChip = 'On hold — pharmacist will call';
const String kRejectedTitle = 'Our pharmacist could not supply this order';
const String kRejectedText = 'It has been cancelled and refunded to the way you paid.';

/// The order-level check state, or null when the server sent none (older API).
String? orderCheckState(Map<String, dynamic> order) {
  final s = asString(order['pharmacist_check'])?.trim();
  return (s == null || s.isEmpty) ? null : s;
}

/// "Checked by pharmacist <name>, Reg. no. <x>" with when it was done.
class CheckedByLine {
  final String text;

  /// '02 Oct 2026, 3:15 PM IST', or null when the server sent no time.
  final String? when;
  const CheckedByLine(this.text, this.when);
}

String _clean(Object? v) => (v?.toString() ?? '').trim();

/// The pharmacist line for one shipment in [state] ('released' or 'rejected'),
/// or null when the shipment has no named pharmacist in that state.
CheckedByLine? pharmacistLineFor(Map<String, dynamic> shipment, {String state = CheckState.released, String prefix = ''}) {
  if (asString(shipment['pharmacist_check']) != state) return null;
  final name = _clean(shipment['pharmacist_name']);
  if (name.isEmpty) return null;
  final reg = _clean(shipment['pharmacist_reg_no']);
  final verb = state == CheckState.rejected ? 'Decided by' : 'Checked by';
  final text = '$prefix$verb pharmacist $name${reg.isEmpty ? '' : ', Reg. no. $reg'}';
  final at = _clean(shipment['pharmacist_checked_at']);
  return CheckedByLine(text, at.isEmpty ? null : formatDateTimeIst(at, zone: true));
}

/// One line per shipment in [state], sellers named when there is more than one.
List<CheckedByLine> pharmacistLines(Map<String, dynamic> order, {String state = CheckState.released}) {
  final shipments = asMapList(order['shipments'])
      .where((s) => asString(s['pharmacist_check']) == state && _clean(s['pharmacist_name']).isNotEmpty)
      .toList();
  return [
    for (final s in shipments)
      pharmacistLineFor(s,
          state: state,
          prefix: shipments.length > 1 ? '${_clean(s['seller_name']).isEmpty ? 'Seller' : _clean(s['seller_name'])}: ' : '')!,
  ];
}

/// The pharmacist's reason for refusing the order, from `cancellation_reason`;
/// null unless the order was refused at the check.
String? refusalReason(Map<String, dynamic> order) {
  if (orderCheckState(order) != CheckState.rejected) return null;
  final raw = _clean(order['cancellation_reason']);
  if (!raw.startsWith(kRefusalReasonPrefix)) return null;
  final reason = raw.substring(kRefusalReasonPrefix.length).trim();
  return reason.isEmpty ? null : reason;
}

/// Header chip text while the check is open, else null (show the order status).
String? checkChipLabel(String status, String? check) {
  if (!kCheckingStatuses.contains(status)) return null;
  if (check == CheckState.held) return kHeldChip;
  if (check == CheckState.pending) return kCheckStepLabel;
  return null;
}

/// One shipment's check in a few words, for the shipment tile (null: say nothing).
String? shipmentCheckNote(Map<String, dynamic> shipment) {
  final status = asString(shipment['status']);
  switch (asString(shipment['pharmacist_check'])) {
    case CheckState.pending:
      return status == 'cancelled' ? null : 'Waiting for the pharmacist check';
    case CheckState.held:
      return 'On hold — our pharmacist will contact you';
    case CheckState.rejected:
      return 'Not supplied after the pharmacist check';
    default:
      return null;
  }
}
