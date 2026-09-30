import 'package:flutter/material.dart';

import 'shipment_tile.dart';

/// Per-shipment seller + invoice, shown only when the order JSON has
/// `shipments`. Each seller issues its own invoice (docs/DECISIONS.md
/// 2026-09-30: partners invoice as seller of record; C-05, C-32, C-33).
///
/// With [orderId] (order detail) each shipment also offers its tax invoice
/// PDF through a signed link opened outside the app (nothing is saved on the
/// device) and, once delivered, "Report a problem" (C-37).
class OrderShipmentsCard extends StatelessWidget {
  final List<Map<String, dynamic>> shipments;
  final String? orderId;
  const OrderShipmentsCard({super.key, required this.shipments, this.orderId});

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
            for (var i = 0; i < shipments.length; i++) ...[
              if (i > 0) const Divider(height: 16),
              ShipmentTile(
                shipment: shipments[i],
                sellerLabel: sellerLabel(shipments[i]),
                orderId: orderId,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
