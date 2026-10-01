import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../config/theme.dart';
import '../../../models/shipment_tracking.dart';

/// Courier tracking for one shipment (Sprint 8): the scans from
/// GET /orders/:id `shipments[].tracking`, newest first and highlighted,
/// with a friendly label, location and local time. When the shipment is
/// being returned to origin (`rto_at` set) a notice is shown instead of
/// leaving the buyer guessing. Renders nothing when there is no tracking.
class TrackingTimeline extends StatelessWidget {
  final ShipmentTracking tracking;
  const TrackingTimeline({super.key, required this.tracking});

  static final DateFormat _timeFormat = DateFormat('d MMM, h:mm a');

  @override
  Widget build(BuildContext context) {
    if (!tracking.hasData) return const SizedBox.shrink();
    // Server sends oldest first; show the latest scan on top.
    final events = tracking.events.reversed.toList();
    final current = tracking.trackingStatus;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (current != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Text(
              'Tracking: ${trackingStatusLabel(current)}',
              style: const TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: AppTheme.brandGreen700),
            ),
          ),
        if (tracking.isReturning) const _ReturningNotice(),
        for (var i = 0; i < events.length; i++)
          _EventRow(
            event: events[i],
            latest: i == 0,
            isLast: i == events.length - 1,
            time: events[i].eventTime == null ? null : _timeFormat.format(events[i].eventTime!),
          ),
      ],
    );
  }
}

class _ReturningNotice extends StatelessWidget {
  const _ReturningNotice();

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: AppTheme.amberBadge,
          borderRadius: BorderRadius.circular(8),
        ),
        child: const Text(
          "Returning to Dawabag — we'll contact you",
          style: TextStyle(fontSize: 12, color: AppTheme.amberText, fontWeight: FontWeight.w600),
        ),
      );
}

class _EventRow extends StatelessWidget {
  final TrackingEvent event;
  final bool latest;
  final bool isLast;
  final String? time;

  const _EventRow({
    required this.event,
    required this.latest,
    required this.isLast,
    this.time,
  });

  @override
  Widget build(BuildContext context) {
    final problem = event.status == 'exception' || event.status == 'rto';
    final dotColor = latest
        ? (problem ? AppTheme.errorRed : AppTheme.brandGreen)
        : Colors.grey.shade400;
    final details = [
      if (event.location != null) event.location!,
      if (time != null) time!,
    ].join(' · ');

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Column(
          children: [
            Container(
              width: latest ? 12 : 8,
              height: latest ? 12 : 8,
              margin: EdgeInsets.only(top: latest ? 2 : 4, left: latest ? 0 : 2, right: latest ? 0 : 2),
              decoration: BoxDecoration(shape: BoxShape.circle, color: dotColor),
            ),
            if (!isLast) Container(width: 2, height: 30, color: Colors.grey.shade200),
          ],
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Padding(
            padding: EdgeInsets.only(bottom: isLast ? 0 : 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  event.label,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: latest ? FontWeight.w700 : FontWeight.normal,
                    color: latest ? Colors.grey.shade900 : Colors.grey.shade600,
                  ),
                ),
                if (details.isNotEmpty)
                  Text(details, style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
              ],
            ),
          ),
        ),
      ],
    );
  }
}
