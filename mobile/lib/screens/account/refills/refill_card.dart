import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../models/refill.dart';
import '../../../providers/refill_provider.dart';
import '../../../utils/formatters.dart';
import 'refill_dialogs.dart';

/// One refill subscription, as the server returned it, with its actions.
/// Every action is a server request; the list is then reloaded.
class RefillCard extends ConsumerWidget {
  final Refill refill;
  final List<PaymentMandate> activeMandates;
  final bool busy;

  const RefillCard({
    super.key,
    required this.refill,
    required this.activeMandates,
    required this.busy,
  });

  Future<void> _run(BuildContext context, Future<String?> action, String success) async {
    final error = await action;
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(error ?? success),
      backgroundColor: error == null ? null : Colors.red,
    ));
  }

  Future<void> _onMenu(BuildContext context, WidgetRef ref, String choice) async {
    final notifier = ref.read(refillProvider.notifier);
    switch (choice) {
      case 'frequency':
        final days = await askRefillFrequency(context, refill.frequencyDays);
        if (days == null || days == refill.frequencyDays || !context.mounted) return;
        await _run(context, notifier.setFrequency(refill.id, days), 'Refill now repeats every $days days');
      case 'items':
        final changed = await editRefillItems(context, refill.items);
        if (changed == null || !context.mounted) return;
        await _run(context, notifier.setItems(refill.id, changed), 'Refill items updated');
      case 'pause':
        await _run(context, notifier.setActive(refill.id, false), 'Refill paused');
      case 'resume':
        await _run(context, notifier.setActive(refill.id, true), 'Refill resumed');
      case 'cancel':
        final ok = await confirmRefillAction(
          context,
          title: 'Cancel this refill?',
          message: 'We will stop placing refill orders for these medicines. '
              'Orders already placed are not affected.',
          confirmLabel: 'Cancel refill',
          destructive: true,
        );
        if (!ok || !context.mounted) return;
        await _run(context, notifier.cancel(refill.id), 'Refill cancelled');
    }
  }

  Future<void> _onMandate(BuildContext context, WidgetRef ref, String? mandateId) async {
    final notifier = ref.read(refillProvider.notifier);
    await _run(
      context,
      notifier.setMandate(refill.id, mandateId),
      mandateId == null ? 'Automatic payment turned off for this refill' : 'Automatic payment turned on for this refill',
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final title = refill.sourceOrderNumber != null
        ? 'From order ${refill.sourceOrderNumber}'
        : 'Refill';
    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 8, 4, 12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
                ),
                _StatusChip(active: refill.isActive),
                PopupMenuButton<String>(
                  enabled: !busy,
                  onSelected: (c) => _onMenu(context, ref, c),
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'frequency', child: Text('Change frequency')),
                    if (refill.items.isNotEmpty)
                      const PopupMenuItem(value: 'items', child: Text('Edit items')),
                    PopupMenuItem(
                      value: refill.isActive ? 'pause' : 'resume',
                      child: Text(refill.isActive ? 'Pause' : 'Resume'),
                    ),
                    const PopupMenuItem(
                      value: 'cancel',
                      child: Text('Cancel refill', style: TextStyle(color: Colors.red)),
                    ),
                  ],
                ),
              ],
            ),
            Padding(
              padding: const EdgeInsets.only(right: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ...refill.items.map((i) => Padding(
                        padding: const EdgeInsets.only(bottom: 4),
                        child: Text('${i.name} × ${i.quantity}', style: const TextStyle(fontSize: 13)),
                      )),
                  const SizedBox(height: 6),
                  Text(
                    'Every ${refill.frequencyDays} days'
                    '${refill.nextRefillDate != null ? ' · next on ${formatDate(refill.nextRefillDate!)}' : ''}',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                  ),
                  const SizedBox(height: 4),
                  _AutoPayRow(
                    refill: refill,
                    activeMandates: activeMandates,
                    busy: busy,
                    onChanged: (id) => _onMandate(context, ref, id),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final bool active;
  const _StatusChip({required this.active});

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: active ? AppTheme.brandGreen50 : AppTheme.amberBadge,
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          active ? 'Active' : 'Paused',
          style: TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: active ? AppTheme.brandGreen700 : AppTheme.amberText,
          ),
        ),
      );
}

/// Automatic payment on/off for one refill: attach an active mandate
/// (PATCH mandate_id) or detach it (mandate_id: null).
class _AutoPayRow extends StatelessWidget {
  final Refill refill;
  final List<PaymentMandate> activeMandates;
  final bool busy;
  final ValueChanged<String?> onChanged;

  const _AutoPayRow({
    required this.refill,
    required this.activeMandates,
    required this.busy,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final on = refill.automaticPaymentOn;
    final canTurnOn = activeMandates.isNotEmpty;
    return Row(
      children: [
        Icon(on ? Icons.autorenew : Icons.link, size: 16, color: on ? AppTheme.brandGreen : Colors.grey.shade500),
        const SizedBox(width: 6),
        Expanded(
          child: Text(
            on
                ? 'Automatic payment on'
                : canTurnOn
                    ? 'Automatic payment off — we send a link to pay'
                    : 'Automatic payment off — turn it on below',
            style: TextStyle(fontSize: 12, color: on ? AppTheme.brandGreen700 : Colors.grey.shade600),
          ),
        ),
        Switch(
          value: on,
          activeColor: AppTheme.brandGreen,
          onChanged: busy || (!on && !canTurnOn)
              ? null
              : (value) => onChanged(value ? activeMandates.first.id : null),
        ),
      ],
    );
  }
}
