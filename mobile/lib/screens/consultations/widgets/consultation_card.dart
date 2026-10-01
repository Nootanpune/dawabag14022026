import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/consultation.dart';
import '../../../utils/consult_format.dart';
import '../../../utils/formatters.dart';

/// Coloured pill for a consultation or payment status.
class ConsultStatusChip extends StatelessWidget {
  final String label;
  final Color background;
  final Color foreground;
  const ConsultStatusChip({
    super.key,
    required this.label,
    required this.background,
    required this.foreground,
  });

  factory ConsultStatusChip.status(String status) {
    final (Color bg, Color fg) = switch (status) {
      'completed' => (AppTheme.brandGreen50, AppTheme.brandGreen700),
      'in_progress' => (Colors.blue.shade50, Colors.blue.shade800),
      'cancelled' => (Colors.grey.shade200, Colors.grey.shade700),
      _ => (AppTheme.amberBadge, AppTheme.amberText),
    };
    return ConsultStatusChip(label: consultStatusLabel(status), background: bg, foreground: fg);
  }

  factory ConsultStatusChip.payment(String paymentStatus) {
    final (Color bg, Color fg) = switch (paymentStatus) {
      'paid' || 'waived' => (AppTheme.brandGreen50, AppTheme.brandGreen700),
      'refunded' => (Colors.blue.shade50, Colors.blue.shade800),
      'refund_pending' => (Colors.amber.shade50, Colors.amber.shade900),
      _ => (Colors.red.shade50, Colors.red.shade700),
    };
    return ConsultStatusChip(label: consultPaymentLabel(paymentStatus), background: bg, foreground: fg);
  }

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(20)),
        child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: foreground)),
      );
}

/// One consultation in "My consultations" with the actions the server
/// allows for its state (pay, join, cancel, view e-prescription). The server
/// re-checks every action and its message is shown when it refuses.
class ConsultationCard extends StatelessWidget {
  final Consultation consultation;
  final bool busy;
  final VoidCallback onPay;
  final VoidCallback onJoin;
  final VoidCallback onCancel;
  final VoidCallback onPrescription;

  const ConsultationCard({
    super.key,
    required this.consultation,
    required this.busy,
    required this.onPay,
    required this.onJoin,
    required this.onCancel,
    required this.onPrescription,
  });

  @override
  Widget build(BuildContext context) {
    final c = consultation;
    final grey = TextStyle(fontSize: 12, color: Colors.grey.shade600);
    final registration = [
      if (c.qualification != null && c.qualification!.isNotEmpty) c.qualification!,
      if (c.regNumber != null && c.regNumber!.isNotEmpty) 'Reg. no. ${c.regNumber}',
      if (c.council != null && c.council!.isNotEmpty) c.council!,
    ].join(' · ');
    final when = [
      if (c.slotDate != null) formatConsultDay(c.slotDate),
      if (c.slotStart != null) '${formatSlotTime(c.slotStart)} IST',
    ].join(', ');

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(c.doctorName ?? 'Doctor',
                      style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                ),
                ConsultStatusChip.status(c.status),
              ],
            ),
            if (registration.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text(registration, style: grey),
            ],
            if (c.speciality != null && c.speciality!.isNotEmpty)
              Text(c.speciality!, style: const TextStyle(fontSize: 12, color: AppTheme.brandGreen700)),
            const SizedBox(height: 8),
            Row(
              children: [
                Icon(_modeIcon(c.mode), size: 16, color: Colors.grey.shade700),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    [consultModeLabel(c.mode), if (when.isNotEmpty) when].join(' · '),
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                ConsultStatusChip.payment(c.paymentStatus),
                if (c.consultKind != null)
                  Text(consultKindLabel(c.consultKind), style: grey),
                if (c.feePaise > 0) Text(formatPrice(c.feePaise), style: grey),
              ],
            ),
            if (c.chiefComplaint != null && c.chiefComplaint!.trim().isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(c.chiefComplaint!.trim(),
                  maxLines: 2, overflow: TextOverflow.ellipsis, style: grey),
            ],
            if (_hasActions(c)) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 4,
                children: [
                  if (c.needsPayment)
                    ElevatedButton.icon(
                      style: _compactElevated,
                      onPressed: busy ? null : onPay,
                      icon: const Icon(Icons.payment, size: 16),
                      label: Text('Pay ${formatPrice(c.feePaise)}'),
                    ),
                  if (c.canJoin)
                    ElevatedButton.icon(
                      style: _compactElevated,
                      onPressed: busy ? null : onJoin,
                      icon: Icon(_modeIcon(c.mode), size: 16),
                      label: const Text('Join'),
                    ),
                  if (c.prescriptionId != null)
                    OutlinedButton.icon(
                      style: _compactOutlined,
                      onPressed: busy ? null : onPrescription,
                      icon: const Icon(Icons.description_outlined, size: 16),
                      label: const Text('E-prescription'),
                    ),
                  if (c.canCancel)
                    TextButton(
                      onPressed: busy ? null : onCancel,
                      style: TextButton.styleFrom(foregroundColor: Colors.red),
                      child: const Text('Cancel'),
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

  static bool _hasActions(Consultation c) =>
      c.needsPayment || c.canJoin || c.canCancel || c.prescriptionId != null;

  static IconData _modeIcon(String mode) => switch (mode) {
        'audio' => Icons.call_outlined,
        'text' => Icons.chat_bubble_outline,
        _ => Icons.videocam_outlined,
      };
}
