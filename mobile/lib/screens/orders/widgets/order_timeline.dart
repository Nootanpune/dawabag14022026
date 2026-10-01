// Order status → timeline position. Pure logic so any status the server
// sends (including ones added later) renders safely.

class TimelineStep {
  final String status;
  final String label;
  const TimelineStep(this.status, this.label);
}

const List<TimelineStep> kTimelineSteps = [
  TimelineStep('pending_payment', 'Order placed'),
  TimelineStep('rx_pending', 'Prescription submitted'),
  TimelineStep('rx_verified', 'Prescription verified'),
  TimelineStep('packed', 'Order packed'),
  TimelineStep('dispatched', 'Dispatched'),
  TimelineStep('delivered', 'Delivered'),
];

/// Forward progress of an order. 'confirmed' (credit / pay-later orders) and
/// 'packing' sit between the displayed steps.
const List<String> kStatusProgress = [
  'pending_payment',
  'confirmed',
  'rx_pending',
  'rx_verified',
  'packing',
  'packed',
  'dispatched',
  'delivered',
];

/// Statuses that end or divert the normal flow, with the note to show.
const Map<String, String> kExceptionNotes = {
  'rx_rejected': 'Prescription rejected. Order cancelled, refund initiated.',
  'cancelled': 'This order was cancelled.',
  'payment_failed': 'Payment did not go through. Please contact support if money was debited.',
  'returned': 'This order was returned.',
};

class TimelineView {
  /// Steps to draw (prescription steps are left out for non-Rx orders).
  final List<TimelineStep> steps;

  /// Index into [steps] of the last step reached, or -1.
  final int reachedStep;

  /// Whether [reachedStep] is the current, still-active step.
  final bool reachedIsCurrent;

  /// Note for a cancelled / rejected / failed / unknown status, else null.
  final String? note;

  const TimelineView(this.steps, this.reachedStep, this.reachedIsCurrent, this.note);

  bool isDone(int i) => i <= reachedStep;
  bool isActive(int i) => reachedIsCurrent && i == reachedStep;
}

/// Maps any order status to a timeline view. Never throws. Pass
/// [requiresPrescription] false to hide the prescription steps.
TimelineView timelineFor(String status, {bool requiresPrescription = true}) {
  final steps = requiresPrescription
      ? kTimelineSteps
      : kTimelineSteps.where((s) => !s.status.startsWith('rx_')).toList();
  final progress = kStatusProgress.indexOf(status);
  if (progress >= 0) {
    var reached = -1;
    for (var i = 0; i < steps.length; i++) {
      if (kStatusProgress.indexOf(steps[i].status) <= progress) reached = i;
    }
    return TimelineView(steps, reached, status != 'delivered', null);
  }
  if (status == 'returned') {
    return TimelineView(steps, steps.length - 1, false, kExceptionNotes[status]);
  }
  final note = kExceptionNotes[status] ??
      (status.isEmpty ? null : 'Current status: ${status.replaceAll('_', ' ')}');
  // Only "Order placed" is certain for an exceptional or unknown status.
  return TimelineView(steps, 0, false, note);
}
