import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/checkout_summary.dart';
import '../../../utils/formatters.dart';

/// One seller's block on the review step (C-35): seller of record, drug
/// licence, ships-from, delivery estimate and each line with MRP, GST,
/// manufacturer, country of origin and batch expiry.
class ReviewShipmentCard extends StatelessWidget {
  final PreviewShipment shipment;
  final int index;
  final int count;
  const ReviewShipmentCard({super.key, required this.shipment, required this.index, required this.count});

  @override
  Widget build(BuildContext context) {
    final s = shipment;
    final grey = TextStyle(fontSize: 11, color: Colors.grey.shade600);
    final seller = (s.sellerName ?? '').trim().isNotEmpty
        ? s.sellerName!.trim()
        : (s.isDawabag ? 'Dawabag' : 'Partner pharmacy');
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (count > 1)
              Text('Shipment ${index + 1} of $count',
                  style: const TextStyle(fontSize: 11, color: AppTheme.brandGreen700, fontWeight: FontWeight.w600)),
            Text('Sold by $seller', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
            if (s.sellerLicence != null) Text('Drug licence ${s.sellerLicence}', style: grey),
            if (s.shipsFrom != null) Text('Ships from ${s.shipsFrom}', style: grey),
            if (s.deliveryEstimate != null)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  children: [
                    const Icon(Icons.schedule, size: 14, color: AppTheme.brandGreen),
                    const SizedBox(width: 4),
                    Text('Delivery ${s.deliveryEstimate!.toLowerCase()}',
                        style: const TextStyle(fontSize: 12, color: AppTheme.brandGreen700)),
                  ],
                ),
              ),
            if (s.coldChain)
              Text('Cold-chain pack: keep refrigerated on arrival', style: grey.copyWith(color: Colors.blue.shade700)),
            const Divider(height: 20),
            ...s.lines.map((l) => _LineRow(line: l)),
            const Divider(height: 16),
            _row('Items', formatPrice(s.subtotalPaise)),
            _row('GST', formatPrice(s.gstPaise)),
            _row('Shipment total', formatPrice(s.totalPaise), bold: true),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false}) => Padding(
        padding: const EdgeInsets.only(top: 2),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(label, style: TextStyle(fontSize: 12, fontWeight: bold ? FontWeight.w700 : null)),
            Text(value, style: TextStyle(fontSize: 12, fontWeight: bold ? FontWeight.w700 : null)),
          ],
        ),
      );
}

class _LineRow extends StatelessWidget {
  final PreviewLine line;
  const _LineRow({required this.line});

  @override
  Widget build(BuildContext context) {
    final l = line;
    final grey = TextStyle(fontSize: 11, color: Colors.grey.shade600);
    final details = [
      if (l.netQuantity != null) l.netQuantity!,
      if (l.manufacturer != null) 'By ${l.manufacturer}',
      'Made in ${l.countryOfOrigin ?? 'India'}',
      if (l.batchExpiry != null) 'Expiry ${l.batchExpiry}',
    ].join(' · ');
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(l.productName, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                Text(
                  '${l.quantity} × ${formatPrice(l.unitPricePaise)}'
                  '${l.mrpPaise > l.unitPricePaise ? ' (MRP ${formatPrice(l.mrpPaise)})' : ''}'
                  '${l.gstRate != null ? ' · GST ${l.gstRate}%' : ''}',
                  style: grey,
                ),
                Text(details, style: grey),
                if (l.drugSchedule != null && l.drugSchedule!.isNotEmpty && l.drugSchedule != 'OTC')
                  Text(l.drugSchedule!, style: grey.copyWith(color: Colors.orange.shade800)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Text(formatPrice(l.lineTotalPaise), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
