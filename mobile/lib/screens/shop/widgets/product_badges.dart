import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../utils/drug_schedule.dart';

/// Schedule badge plus a cold-chain badge when the product needs it.
class ProductBadges extends StatelessWidget {
  final String schedule;
  final bool coldChain;
  const ProductBadges({super.key, required this.schedule, required this.coldChain});

  @override
  Widget build(BuildContext context) {
    // Amber for prescription schedules; Non-scheduled and OTC are plain (Sprint 31)
    final isH = isRxSchedule(schedule);
    return Wrap(
      spacing: 8,
      runSpacing: 6,
      children: [
        _Pill(
          text: schedule,
          background: isH ? AppTheme.amberBadge : AppTheme.brandTeal50,
          foreground: isH ? AppTheme.amberText : AppTheme.brandTeal700,
        ),
        if (coldChain)
          const _Pill(
            text: 'Cold chain',
            icon: Icons.ac_unit,
            background: Color(0xFFE6F1FB),
            foreground: Color(0xFF0C447C),
          ),
      ],
    );
  }
}

class _Pill extends StatelessWidget {
  final String text;
  final IconData? icon;
  final Color background;
  final Color foreground;
  const _Pill({required this.text, this.icon, required this.background, required this.foreground});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(20)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        if (icon != null) ...[Icon(icon, size: 12, color: foreground), const SizedBox(width: 4)],
        Text(text, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: foreground)),
      ]),
    );
  }
}
