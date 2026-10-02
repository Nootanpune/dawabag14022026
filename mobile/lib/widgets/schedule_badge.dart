import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../utils/drug_schedule.dart';

/// Small schedule badge for lists (search results, suggestions): "Rx" in amber
/// for Schedule H / H1 — the pharmacist checks the prescription before dispatch
/// (C-08) — or a plain "Non-scheduled" (Sprint 31). Nothing for OTC.
class ScheduleBadge extends StatelessWidget {
  final String? schedule;
  const ScheduleBadge(this.schedule, {super.key});

  @override
  Widget build(BuildContext context) {
    final text = scheduleListBadge(schedule);
    if (text == null) return const SizedBox.shrink();
    final rx = isRxSchedule(schedule);
    return Semantics(
      label: rx ? 'Prescription medicine' : 'Non-scheduled medicine',
      excludeSemantics: true,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
        decoration: BoxDecoration(
          color: rx ? AppTheme.amberBadge : Colors.grey.shade200,
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(text,
            style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.w700, color: rx ? AppTheme.amberText : Colors.grey.shade800)),
      ),
    );
  }
}
