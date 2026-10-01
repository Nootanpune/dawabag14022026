import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/grievance.dart';
import '../../../utils/ist.dart';

/// Coloured status pill for a complaint.
class GrievanceStatusChip extends StatelessWidget {
  final String status;
  const GrievanceStatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg) = switch (status) {
      'resolved' || 'closed' => (AppTheme.brandGreen50, AppTheme.brandGreen700),
      'acknowledged' || 'in_progress' => (Colors.blue.shade50, Colors.blue.shade800),
      _ => (AppTheme.amberBadge, AppTheme.amberText),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
      child: Text(grievanceStatusLabel(status),
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg)),
    );
  }
}

/// Deadline line from the server's SLA fields (C-36): acknowledgement due
/// while open, resolution due until resolved; flagged when overdue.
class GrievanceDeadlineText extends StatelessWidget {
  final Grievance grievance;
  const GrievanceDeadlineText({super.key, required this.grievance});

  @override
  Widget build(BuildContext context) {
    final g = grievance;
    String? text;
    var overdue = false;
    if (g.isResolved) {
      if (g.resolvedAt != null) text = 'Resolved ${formatDateIst(g.resolvedAt!)}';
    } else if (g.acknowledgedAt == null && g.ackDueAt != null) {
      overdue = g.ackOverdue;
      text = overdue
          ? 'Acknowledgement overdue (was due ${formatDateTimeIst(g.ackDueAt!)})'
          : 'We will acknowledge by ${formatDateTimeIst(g.ackDueAt!)}';
    } else if (g.resolveDueAt != null) {
      overdue = g.resolutionOverdue;
      text = overdue
          ? 'Resolution overdue (was due ${formatDateIst(g.resolveDueAt!)})'
          : 'Resolution due by ${formatDateIst(g.resolveDueAt!)}';
    }
    if (text == null) return const SizedBox.shrink();
    return Text(text,
        style: TextStyle(
          fontSize: 11,
          color: overdue ? Colors.red.shade700 : Colors.grey.shade600,
          fontWeight: overdue ? FontWeight.w600 : FontWeight.normal,
        ));
  }
}

/// One row in the complaints list.
class GrievanceTile extends StatelessWidget {
  final Grievance grievance;
  final VoidCallback onTap;
  const GrievanceTile({super.key, required this.grievance, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final g = grievance;
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(g.ticketNo,
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  ),
                  GrievanceStatusChip(status: g.status),
                ],
              ),
              const SizedBox(height: 6),
              Text(g.subject,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(
                [
                  grievanceCategoryLabel(g.category),
                  if (g.orderNumber != null) 'Order ${g.orderNumber}',
                  if (g.createdAt != null) formatDateIst(g.createdAt!),
                ].join(' · '),
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
              const SizedBox(height: 4),
              GrievanceDeadlineText(grievance: g),
            ],
          ),
        ),
      ),
    );
  }
}
