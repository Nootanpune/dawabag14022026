// Order status + pharmacist check → timeline steps. Pure logic so any status
// the server sends (including ones added later) renders safely.
//
// Sprint 36: every order shows a "Pharmacist check" step (Sprint 35 owner
// decision, C-08): a registered pharmacist checks and releases every order
// before it is packed. For a prescription order the prescription review is that
// check, so there is no separate "Prescription verified" step.

import '../../../utils/pharmacist_check.dart';

class TimelineStep {
  /// placed / rx / check / packed / dispatched / delivered
  final String key;
  final String label;
  final bool done;
  final bool active;

  /// Short line under the label (e.g. "Our pharmacist will call you…").
  final String? note;

  /// Shown in amber (a hold) rather than grey.
  final bool warn;

  const TimelineStep(this.key, this.label, {this.done = false, this.active = false, this.note, this.warn = false});
}

const List<String> _afterPacking = ['packed', 'dispatched', 'delivered', 'returned'];
const List<String> _paidOrConfirmed = [
  'confirmed', 'rx_pending', 'rx_verified', 'rx_rejected', 'packing', ..._afterPacking,
];

/// Statuses that end or divert the normal flow, with the note to show.
const Map<String, String> kExceptionNotes = {
  // The order stays open: a new prescription puts it back with the pharmacist (C-08)
  'rx_rejected': 'Our pharmacist could not accept the prescription for this order. Upload a new prescription '
      'from Prescriptions, or cancel the order for a full refund to the way you paid.',
  'cancelled': 'This order was cancelled.',
  'payment_failed': 'Payment did not go through. Please contact support if money was debited.',
  'returned': 'This order was returned.',
};

class TimelineView {
  final List<TimelineStep> steps;

  /// Note for a cancelled / rejected / failed / unknown status, else null.
  final String? note;

  const TimelineView(this.steps, this.note);

  bool isDone(int i) => steps[i].done;
  bool isActive(int i) => steps[i].active;
  TimelineStep? step(String key) {
    for (final s in steps) {
      if (s.key == key) return s;
    }
    return null;
  }
}

const List<String> _known = [
  'pending_payment', 'payment_failed', 'confirmed', 'rx_pending', 'rx_verified', 'rx_rejected',
  'packing', 'packed', 'dispatched', 'delivered', 'cancelled', 'returned',
];

/// Maps any order status and pharmacist check to a timeline. Never throws.
/// [requiresPrescription] false hides the prescription step; [pharmacistCheck]
/// is the order's `pharmacist_check` (null from an older server).
TimelineView timelineFor(String status, {bool requiresPrescription = true, String? pharmacistCheck}) {
  final s = status;
  final check = pharmacistCheck;
  final stopped = s == 'cancelled' || s == 'rx_rejected' || s == 'payment_failed';
  final rx = requiresPrescription && s != 'pending_payment' && s != 'payment_failed';
  final checked = _afterPacking.contains(s) ||
      check == CheckState.released ||
      (check == CheckState.notRecorded && s != 'cancelled');
  final checking = !checked && kCheckingStatuses.contains(s);
  final held = check == CheckState.held && !stopped;

  final steps = <TimelineStep>[
    const TimelineStep('placed', 'Order placed', done: true),
    if (rx)
      TimelineStep('rx', 'Prescription submitted',
          done: s != 'rx_pending' && s != 'rx_rejected' && _paidOrConfirmed.contains(s),
          active: s == 'rx_pending',
          note: s == 'rx_pending' ? 'Our pharmacist will call you to verify your prescription' : null),
    TimelineStep('check', kCheckStepLabel,
        done: checked,
        active: !stopped && (checking || s == 'rx_pending'),
        warn: held,
        note: held
            ? kHeldTitle
            : check == CheckState.rejected
                ? 'Not supplied after the check'
                : checking
                    ? kCheckingNote
                    : null),
    TimelineStep('packed', 'Order packed', done: _afterPacking.contains(s)),
    TimelineStep('dispatched', 'Dispatched', done: ['dispatched', 'delivered', 'returned'].contains(s)),
    TimelineStep('delivered', 'Delivered', done: s == 'delivered' || s == 'returned'),
  ];

  String? note = kExceptionNotes[s];
  // A refusal at the check has its own card; the plain "cancelled" note would repeat it
  if (s == 'cancelled' && check == CheckState.rejected) note = null;
  if (note == null && s.isNotEmpty && !_known.contains(s)) note = 'Current status: ${s.replaceAll('_', ' ')}';
  return TimelineView(steps, note);
}
