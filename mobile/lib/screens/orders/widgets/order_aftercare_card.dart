import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../models/aftercare.dart';
import '../../../services/api_service.dart';
import '../../../services/invoice_api.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/open_pdf_button.dart';

/// Refunds, credit notes and return requests on an order (C-37). Hidden
/// when the order has none.
class OrderAftercareCard extends StatelessWidget {
  final Map<String, dynamic> order;
  const OrderAftercareCard({super.key, required this.order});

  @override
  Widget build(BuildContext context) {
    final refunds = Refund.listFrom(order['refunds']);
    final creditNotes = CreditNote.listFrom(order['credit_notes']);
    final returns = ReturnRequest.listFrom(order['returns']);
    if (refunds.isEmpty && creditNotes.isEmpty && returns.isEmpty) return const SizedBox.shrink();
    final grey = TextStyle(fontSize: 11, color: Colors.grey.shade600);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (returns.isNotEmpty) ...[
              const _Title('Return requests'),
              ...returns.map((r) => ListTile(
                    dense: true,
                    contentPadding: EdgeInsets.zero,
                    title: Text('${r.returnNo} · ${returnReasonLabel(r.reason)}',
                        style: const TextStyle(fontSize: 13)),
                    subtitle: Text(returnStatusLabel(r.status), style: grey),
                    trailing: const Icon(Icons.chevron_right, size: 18),
                    onTap: r.id.isEmpty ? null : () => context.push('/account/returns/${r.id}'),
                  )),
            ],
            if (refunds.isNotEmpty) ...[
              const _Title('Refunds'),
              ...refunds.map((r) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(refundMethodLabel(r.method), style: const TextStyle(fontSize: 13)),
                              Text(refundStatusLabel(r.status), style: grey),
                            ],
                          ),
                        ),
                        Text(formatPrice(r.amountPaise),
                            style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                      ],
                    ),
                  )),
            ],
            if (creditNotes.isNotEmpty) ...[
              const _Title('Credit notes'),
              ...creditNotes.map((c) => Row(
                    children: [
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(c.number, style: const TextStyle(fontSize: 13)),
                            Text(formatPrice(c.totalPaise), style: grey),
                          ],
                        ),
                      ),
                      if (c.id != null)
                        OpenPdfButton(
                          label: 'View',
                          resolve: () => apiService.creditNoteUri(c.id!),
                        ),
                    ],
                  )),
            ],
          ],
        ),
      ),
    );
  }
}

class _Title extends StatelessWidget {
  final String text;
  const _Title(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 4, bottom: 6),
        child: Text(text, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
      );
}
