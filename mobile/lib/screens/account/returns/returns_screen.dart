import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/aftercare.dart';
import '../../../providers/aftercare_provider.dart';
import '../../../services/api_service.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/error_retry_view.dart';

/// /account/returns — "Returns & refunds" (C-37). Both lists come from the
/// server (GET /returns, GET /returns/refunds/my) every time the screen opens.
class ReturnsScreen extends ConsumerWidget {
  const ReturnsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) => DefaultTabController(
        length: 2,
        child: Scaffold(
          appBar: AppBar(
            title: const Text('Returns & refunds'),
            bottom: const TabBar(
              labelColor: AppTheme.brandGreen,
              indicatorColor: AppTheme.brandGreen,
              tabs: [Tab(text: 'Returns'), Tab(text: 'Refunds')],
            ),
          ),
          body: const TabBarView(children: [_ReturnsTab(), _RefundsTab()]),
        ),
      );
}

class _ReturnsTab extends ConsumerWidget {
  const _ReturnsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(returnsProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
      error: (e, _) => ErrorRetryView(
        message: ApiService.errorMessage(e, fallback: 'Could not load your returns'),
        onRetry: () => ref.invalidate(returnsProvider),
      ),
      data: (returns) => RefreshIndicator(
        color: AppTheme.brandGreen,
        onRefresh: () => ref.refresh(returnsProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'To return an item, open the order and tap "Report a problem" on the delivered '
              'shipment. Damaged, wrong or missing items must be reported within 48 hours of '
              'delivery; expiry and quality claims within 30 days.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 12),
            if (returns.isEmpty) const _Empty('No return requests yet'),
            ...returns.map((r) => Card(
                  child: ListTile(
                    title: Text('${r.returnNo} · ${returnReasonLabel(r.reason)}',
                        style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      [
                        if (r.orderNumber != null) 'Order ${r.orderNumber}',
                        returnStatusLabel(r.status),
                        if (r.createdAt != null) formatDate(r.createdAt!),
                      ].join(' · '),
                      style: const TextStyle(fontSize: 12),
                    ),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () async {
                      await context.push('/account/returns/${r.id}');
                      if (context.mounted) ref.invalidate(returnsProvider);
                    },
                  ),
                )),
          ],
        ),
      ),
    );
  }
}

class _RefundsTab extends ConsumerWidget {
  const _RefundsTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myRefundsProvider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
      error: (e, _) => ErrorRetryView(
        message: ApiService.errorMessage(e, fallback: 'Could not load your refunds'),
        onRetry: () => ref.invalidate(myRefundsProvider),
      ),
      data: (refunds) => RefreshIndicator(
        color: AppTheme.brandGreen,
        onRefresh: () => ref.refresh(myRefundsProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (refunds.isEmpty) const _Empty('No refunds yet'),
            ...refunds.map((r) => Card(
                  child: ListTile(
                    title: Text(formatPrice(r.amountPaise),
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    subtitle: Text(
                      [
                        if (r.orderNumber != null) 'Order ${r.orderNumber}',
                        refundMethodLabel(r.method),
                        if (r.createdAt != null) formatDate(r.createdAt!),
                      ].join(' · '),
                      style: const TextStyle(fontSize: 12),
                    ),
                    trailing: Text(refundStatusLabel(r.status),
                        style: TextStyle(
                            fontSize: 12,
                            color: r.status == 'processed' ? AppTheme.brandGreen : Colors.orange.shade800)),
                    onTap: r.orderId == null ? null : () => context.push('/orders/${r.orderId}'),
                  ),
                )),
          ],
        ),
      ),
    );
  }
}

class _Empty extends StatelessWidget {
  final String text;
  const _Empty(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 40),
        child: Center(child: Text(text, style: TextStyle(color: Colors.grey.shade500))),
      );
}
