import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../providers/refill_provider.dart';

/// Frequencies offered from a delivered order (contract allows 7–180 days;
/// other values can be set later on the refills screen).
const List<int> kOrderRefillChoices = [15, 30, 45, 60, 90];

/// "Refill every…" on a delivered order: POST /refills { order_id,
/// frequency_days }, then offers to open the refills screen.
class RefillOrderCard extends ConsumerStatefulWidget {
  final String orderId;
  const RefillOrderCard({super.key, required this.orderId});

  @override
  ConsumerState<RefillOrderCard> createState() => _RefillOrderCardState();
}

class _RefillOrderCardState extends ConsumerState<RefillOrderCard> {
  bool _saving = false;

  Future<void> _choose() async {
    final days = await showModalBottomSheet<int>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(
              title: Text('Refill every…', style: TextStyle(fontWeight: FontWeight.w700)),
              subtitle: Text("We'll remind you 3 days before each refill."),
            ),
            ...kOrderRefillChoices.map((d) => ListTile(
                  leading: const Icon(Icons.event_repeat),
                  title: Text('$d days'),
                  onTap: () => Navigator.pop(ctx, d),
                )),
          ],
        ),
      ),
    );
    if (days == null || !mounted) return;
    setState(() => _saving = true);
    final error = await ref.read(refillProvider.notifier).create(widget.orderId, days);
    if (!mounted) return;
    setState(() => _saving = false);
    if (error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error), backgroundColor: Colors.red),
      );
      return;
    }
    final open = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Refill set up'),
        content: Text(
          'These medicines will be reordered every $days days. You can pause, change or '
          'turn on automatic payment from your refills.',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Close')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Open refills')),
        ],
      ),
    );
    if (open == true && mounted) context.push('/account/refills');
  }

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              const Icon(Icons.replay, color: AppTheme.brandTeal),
              const SizedBox(width: 12),
              const Expanded(
                child: Text('Get these medicines again on a schedule',
                    style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
              ),
              TextButton(
                onPressed: _saving ? null : _choose,
                child: _saving
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Text('Refill every…'),
              ),
            ],
          ),
        ),
      );
}
