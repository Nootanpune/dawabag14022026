import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../utils/ist.dart';
import '../../../utils/prescription_status.dart';

/// One prescription: when, status in plain words, and View.
class PrescriptionTile extends StatelessWidget {
  final Map<String, dynamic> rx;
  final VoidCallback? onView;
  const PrescriptionTile({super.key, required this.rx, this.onView});

  static const _tones = {
    RxTone.waiting: (Color(0xFFFAEEDA), Color(0xFF633806)),
    RxTone.ok: (Color(0xFFE6F4EA), Color(0xFF1E6B35)),
    RxTone.bad: (Color(0xFFFDE8E8), AppTheme.errorRed),
    RxTone.muted: (Color(0xFFEEEEEE), Color(0xFF555555)),
  };

  @override
  Widget build(BuildContext context) {
    final status = prescriptionStatus(rx);
    final (bg, fg) = _tones[status.tone]!;
    final doctor = rx['doctor_name']?.toString();
    final digital = rx['is_digital'] == true;
    final title = digital
        ? 'E-prescription${doctor != null ? ' from Dr. $doctor' : ''}'
        : doctor != null ? 'Prescription from Dr. $doctor' : 'Prescription (${(rx['file_type'] ?? 'file').toString().toUpperCase()})';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Icon(Icons.description_outlined, color: AppTheme.brandGreen, size: 28),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  Text('Uploaded ${formatDateIst(rx['created_at'])}',
                      style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(20)),
                    child: Text(status.label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: fg)),
                  ),
                  const SizedBox(height: 4),
                  Text(status.hint, style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
                ],
              ),
            ),
            if (onView != null && !digital)
              TextButton(onPressed: onView, child: const Text('View')),
          ],
        ),
      ),
    );
  }
}
