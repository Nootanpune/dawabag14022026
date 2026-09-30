import 'package:flutter/material.dart';

import '../../../utils/formatters.dart';

/// Per-shipment seller + invoice, shown only when the order JSON has
/// `shipments` (POST /orders response, contract section C). Shows only what
/// the API returned: seller_type, invoice_number, total_paise and a partner
/// name if the server ever includes one. Each seller issues its own invoice
/// (docs/DECISIONS.md 2026-09-30: partners invoice as seller of record;
/// C-05, C-32, C-33).
class OrderShipmentsCard extends StatelessWidget {
  final List<Map<String, dynamic>> shipments;
  const OrderShipmentsCard({super.key, required this.shipments});

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
                          if (invoice != null && invoice.toString().isNotEmpty)
                            Text('Invoice $invoice',
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
          ],
        ),
      ),
    );
  }
}
