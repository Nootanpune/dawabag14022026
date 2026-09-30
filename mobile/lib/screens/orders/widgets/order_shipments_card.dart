import 'package:flutter/material.dart';

import '../../../utils/formatters.dart';

/// Per-shipment seller + invoice, shown only when the order JSON has
/// `shipments` (POST /orders response, contract section C). Shows only what
/// the API returned: seller_type, invoice_number, total_paise and a partner
/// name if the server ever includes one. Each seller issues its own invoice
/// (docs/DECISIONS.md 2026-09-30: partners invoice as seller of record;
/// C-05, C-32, C-33).
///
/// Invoice PDFs (GET /invoices/shipments/:id.pdf) are not opened in the app:
/// there is no PDF viewer dependency, the endpoint needs the Bearer token (so
/// an external browser cannot open it), and saving the file to the device is
/// not allowed (server is the single source of truth). With
/// [showInvoiceNote] the card shows the invoice number and where to get it.
class OrderShipmentsCard extends StatelessWidget {
  final List<Map<String, dynamic>> shipments;
  final bool showInvoiceNote;
  const OrderShipmentsCard({super.key, required this.shipments, this.showInvoiceNote = false});

  static bool _hasInvoice(Map<String, dynamic> s) {
    final invoice = s['invoice_number'];
    return invoice != null && invoice.toString().isNotEmpty;
  }

  /// Shipments from an order map, or empty when the API sent none.
  static List<Map<String, dynamic>> fromOrder(Map<String, dynamic>? order) {
    final raw = order?['shipments'];
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((m) => Map<String, dynamic>.from(m)).toList();
  }

  static String sellerLabel(Map<String, dynamic> s) {
    if (s['seller_type'] == 'dawabag') return 'Sold by Dawabag';
    final name = s['partner_name'] ?? s['seller_name'];
    if (name is String && name.trim().isNotEmpty) return 'Sold by ${name.trim()}';
    return 'Sold by a partner pharmacy';
  }

  @override
  Widget build(BuildContext context) {
    if (shipments.isEmpty) return const SizedBox.shrink();
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(shipments.length == 1 ? 'Shipment' : '${shipments.length} shipments',
                style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 8),
            ...shipments.map((s) {
              final invoice = s['invoice_number'];
              final total = s['total_paise'];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Icon(Icons.local_shipping_outlined, size: 18, color: Colors.grey.shade600),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(sellerLabel(s),
                              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          if (_hasInvoice(s))
                            Text('Tax invoice $invoice',
                                style: TextStyle(fontSize: 11, color: Colors.grey.shade500)),
                        ],
                      ),
                    ),
                    if (total is num)
                      Text(formatPrice(total.round()),
                          style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ],
                ),
              );
            }),
            if (showInvoiceNote && shipments.any(_hasInvoice))
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.info_outline, size: 14, color: Colors.grey.shade500),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        'Each seller issues its own tax invoice. To view or download the PDF, '
                        'open this order on the Dawabag website (dawabag.in).',
                        style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
                      ),
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
