import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/refill.dart';
import '../../../utils/formatters.dart';
import '../../../utils/ist.dart';

/// "Automatic payment" section: the server's mandate list, a button to
/// start a new UPI mandate, and a note after a mandate was started.
class MandateSection extends StatelessWidget {
  final List<PaymentMandate> mandates;
  final bool busy;
  final bool starting;

  /// Shown under the button (e.g. "Automatic payment is not available yet").
  final String? note;
  final VoidCallback onTurnOn;
  final ValueChanged<PaymentMandate> onCancel;

  const MandateSection({
    super.key,
    required this.mandates,
    required this.busy,
    required this.starting,
    required this.onTurnOn,
    required this.onCancel,
    this.note,
  });

  static String _statusLabel(String status) => switch (status) {
        'active' => 'Active',
        'cancelled' => 'Turned off',
        'pending' => 'Waiting for authorisation',
        'failed' => 'Authorisation failed',
        '' => '—',
        _ => status.replaceAll('_', ' '),
      };

  @override
  Widget build(BuildContext context) {
    final shown = mandates.where((m) => !m.isCancelled).toList();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Automatic payment', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 6),
            Text(
              'Authorise UPI once and we charge your refills automatically '
              '(up to ₹15,000 per refill). You can turn it off any time.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 8),
            ...shown.map((m) => ListTile(
                  contentPadding: EdgeInsets.zero,
                  dense: true,
                  leading: Icon(
                    m.isActive
                        ? Icons.verified
                        : m.status == 'failed'
                            ? Icons.error_outline
                            : Icons.hourglass_top,
                    color: m.isActive ? AppTheme.brandGreen : Colors.orange.shade700,
                  ),
                  title: Text('${m.method.toUpperCase()} · up to ${formatPrice(m.maxAmountPaise)}',
                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  subtitle: Text(
                    '${_statusLabel(m.status)}'
                    '${m.activatedAt != null ? ' · since ${formatDateIst(m.activatedAt!)}' : ''}',
                    style: const TextStyle(fontSize: 12),
                  ),
                  trailing: TextButton(
                    onPressed: busy ? null : () => onCancel(m),
                    child: const Text('Turn off', style: TextStyle(color: Colors.red)),
                  ),
                )),
            const SizedBox(height: 8),
            OutlinedButton.icon(
              onPressed: busy || starting ? null : onTurnOn,
              icon: starting
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.autorenew),
              label: const Text('Turn on automatic payment'),
            ),
            if (note != null) ...[
              const SizedBox(height: 8),
              Text(note!, style: TextStyle(fontSize: 12, color: Colors.orange.shade800)),
            ],
          ],
        ),
      ),
    );
  }
}
