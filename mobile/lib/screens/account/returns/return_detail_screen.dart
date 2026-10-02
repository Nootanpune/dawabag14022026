import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/aftercare.dart';
import '../../../providers/aftercare_provider.dart';
import '../../../services/api_service.dart';
import '../../../utils/formatters.dart';
import '../../../utils/ist.dart';
import '../../../widgets/error_retry_view.dart';
import '../../../widgets/summary_row.dart';

/// /account/returns/:id — one return request with its items, the
/// pharmacist's decision, credit notes and refunds (C-37).
class ReturnDetailScreen extends ConsumerWidget {
  final String returnId;
  const ReturnDetailScreen({super.key, required this.returnId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(returnDetailProvider(returnId));
    return Scaffold(
      appBar: AppBar(title: const Text('Return request')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load this return'),
          onRetry: () => ref.invalidate(returnDetailProvider(returnId)),
        ),
        data: (r) => RefreshIndicator(
          color: AppTheme.brandTeal,
          onRefresh: () => ref.refresh(returnDetailProvider(returnId).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _card([
                Text(r.returnNo, style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                SummaryRow('Status', returnStatusLabel(r.status), bold: true),
                const SizedBox(height: 4),
                SummaryRow('Reason', returnReasonLabel(r.reason)),
                if (r.sellerName != null) SummaryRow('Seller', r.sellerName!),
                if (r.createdAt != null) SummaryRow('Reported', formatDateTimeIst(r.createdAt!)),
                if (r.refundPaise != null && r.refundPaise! > 0)
                  SummaryRow('Refund', formatPrice(r.refundPaise!), valueColor: AppTheme.brandTeal),
                if (r.orderId != null)
                  Align(
                    alignment: Alignment.centerLeft,
                    child: TextButton(
                      onPressed: () => context.push('/orders/${r.orderId}'),
                      child: Text('Open order ${r.orderNumber ?? ''}'.trim()),
                    ),
                  ),
              ]),
              if ((r.description ?? '').isNotEmpty)
                _card([const _Title('What you told us'), Text(r.description!, style: const TextStyle(fontSize: 13))]),
              if ((r.decisionNotes ?? '').isNotEmpty)
                _card([const _Title('Our decision'), Text(r.decisionNotes!, style: const TextStyle(fontSize: 13))]),
              if (r.items.isNotEmpty)
                _card([
                  const _Title('Items'),
                  ...r.items.map((i) => ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.zero,
                        title: Text(i.productName, style: const TextStyle(fontSize: 13)),
                        subtitle: Text(
                          [
                            'Qty ${i.quantity}',
                            if (i.batchNumber != null) 'Batch ${i.batchNumber}',
                            if (i.expiryDate != null) 'Exp ${formatDateIst(i.expiryDate!)}',
                          ].join(' · '),
                          style: const TextStyle(fontSize: 11),
                        ),
                      )),
                ]),
              if (r.refunds.isNotEmpty)
                _card([
                  const _Title('Refunds'),
                  ...r.refunds.map((f) => SummaryRow(
                      '${refundMethodLabel(f.method)} — ${refundStatusLabel(f.status)}', formatPrice(f.amountPaise))),
                ]),
              if (r.creditNotes.isNotEmpty)
                _card([
                  const _Title('Credit notes'),
                  ...r.creditNotes.map((c) => SummaryRow(c.number, formatPrice(c.totalPaise))),
                  const SizedBox(height: 4),
                  Text('Credit note PDFs are on the order page.',
                      style: TextStyle(fontSize: 11, color: Colors.grey.shade600)),
                ]),
            ],
          ),
        ),
      ),
    );
  }

  Widget _card(List<Widget> children) => Card(
        margin: const EdgeInsets.only(bottom: 12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: children),
        ),
      );
}

class _Title extends StatelessWidget {
  final String text;
  const _Title(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
      );
}
