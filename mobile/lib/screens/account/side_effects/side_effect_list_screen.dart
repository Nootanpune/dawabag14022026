import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../config/theme.dart';
import '../../../models/adverse_event.dart';
import '../../../providers/adverse_event_provider.dart';
import '../../../services/api_service.dart';
import '../../../utils/ist.dart';
import '../../../widgets/error_retry_view.dart';

/// /account/side-effects — the buyer's side-effect reports and where each
/// stands (C-29). New reports start from an order line ("Report a side
/// effect"), so the product is always known.
class SideEffectListScreen extends ConsumerWidget {
  const SideEffectListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(adverseEventsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Side-effect reports')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load your reports'),
          onRetry: () => ref.invalidate(adverseEventsProvider),
        ),
        data: (reports) => RefreshIndicator(
          color: AppTheme.brandGreen,
          onRefresh: () => ref.refresh(adverseEventsProvider.future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                'To report a new side effect, open the order and tap "Report a side effect" on the '
                'medicine. A pharmacist reviews every report and forwards it to the national '
                'pharmacovigilance programme (PvPI). In an emergency, see a doctor first.',
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
              const SizedBox(height: 12),
              if (reports.isEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 40),
                  child: Center(
                      child: Text('No reports yet', style: TextStyle(color: Colors.grey.shade500))),
                ),
              ...reports.map((r) => Card(
                    child: ListTile(
                      leading: Icon(
                        r.isSerious ? Icons.warning_amber_rounded : Icons.healing_outlined,
                        color: r.isSerious ? Colors.red : Colors.orange.shade700,
                      ),
                      title: Text(r.productName ?? r.reportNo,
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        [
                          r.reportNo,
                          adrSeriousnessLabel(r.seriousness),
                          adrStatusLabel(r.status),
                          if (r.createdAt != null) formatDateIst(r.createdAt!),
                        ].join(' · '),
                        style: const TextStyle(fontSize: 12),
                      ),
                    ),
                  )),
            ],
          ),
        ),
      ),
    );
  }
}
