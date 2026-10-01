import 'package:flutter/material.dart';

import '../../../../config/theme.dart';
import '../../../../models/consultation.dart';
import '../../../../models/doctor_consultation.dart';
import '../../../../utils/consult_format.dart';
import '../../../consultations/widgets/consultation_card.dart' show ConsultStatusChip;

/// One consultation in the doctor's day list: slot time, patient, mode,
/// consultation and payment status, with Join / End actions (Mobile Sprint
/// 15). The server re-checks both; its message is shown when it refuses.
/// C-22: the e-prescription is written on the website by the registered
/// doctor; the app only tells the doctor where.
class DoctorConsultationCard extends StatelessWidget {
  final DoctorConsultation consultation;
  final bool busy;
  final VoidCallback onJoin;
  final VoidCallback onEnd;

  const DoctorConsultationCard({
    super.key,
    required this.consultation,
    required this.busy,
    required this.onJoin,
    required this.onEnd,
  });

  @override
  Widget build(BuildContext context) {
    final c = consultation;
    final grey = TextStyle(fontSize: 12, color: Colors.grey.shade600);
    final time = [
      if (c.slotStart != null) formatSlotTime(c.slotStart),
      if (c.slotEnd != null) formatSlotTime(c.slotEnd),
    ].join(' – ');
    final details = c.patientDetails;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.schedule, size: 16, color: Colors.grey.shade700),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(time.isEmpty ? 'Slot time not set' : '$time IST',
                      style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                ),
                ConsultStatusChip.status(c.status),
              ],
            ),
            const SizedBox(height: 6),
            Text(c.patientName ?? 'Patient',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            if (details.isNotEmpty) Text(details, style: grey),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(_modeIcon(c.mode), size: 15, color: Colors.grey.shade700),
                    const SizedBox(width: 4),
                    Text(consultModeLabel(c.mode), style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w500)),
                  ],
                ),
                ConsultStatusChip.payment(c.paymentStatus),
                if (c.consultKind != null) Text(consultKindLabel(c.consultKind), style: grey),
              ],
            ),
            if (c.chiefComplaint != null && c.chiefComplaint!.trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(c.chiefComplaint!.trim(), maxLines: 3, overflow: TextOverflow.ellipsis, style: grey),
            ],
            if (c.prescriptionId != null) ...[
              const SizedBox(height: 6),
              const Row(
                children: [
                  Icon(Icons.description_outlined, size: 15, color: AppTheme.brandGreen700),
                  SizedBox(width: 4),
                  Text('E-prescription issued',
                      style: TextStyle(fontSize: 12, color: AppTheme.brandGreen700, fontWeight: FontWeight.w600)),
                ],
              ),
            ] else if (c.status == 'in_progress' || c.status == 'completed') ...[
              const SizedBox(height: 6),
              Text('Write the e-prescription on the Dawabag website.', style: grey),
            ],
            if (c.canTryJoin || c.canEnd) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if (c.canTryJoin)
                    ElevatedButton.icon(
                      style: _compactElevated,
                      onPressed: busy ? null : onJoin,
                      icon: Icon(_modeIcon(c.mode), size: 16),
                      label: const Text('Join'),
                    ),
                  if (c.canEnd)
                    OutlinedButton.icon(
                      style: _compactOutlined,
                      onPressed: busy ? null : onEnd,
                      icon: const Icon(Icons.call_end, size: 16),
                      label: const Text('End consultation'),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  // The app theme gives buttons an infinite minimum width; inside a Wrap
  // they need a finite one.
  static final ButtonStyle _compactElevated = ElevatedButton.styleFrom(
    minimumSize: const Size(0, 40),
    padding: const EdgeInsets.symmetric(horizontal: 14),
  );
  static final ButtonStyle _compactOutlined = OutlinedButton.styleFrom(
    minimumSize: const Size(0, 40),
    padding: const EdgeInsets.symmetric(horizontal: 14),
  );

  static IconData _modeIcon(String mode) => switch (mode) {
        'audio' => Icons.call_outlined,
        'text' => Icons.chat_bubble_outline,
        _ => Icons.videocam_outlined,
      };
}
