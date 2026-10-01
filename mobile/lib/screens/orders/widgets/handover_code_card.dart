import 'package:flutter/material.dart';

import '../../../config/theme.dart';

/// The 6-digit delivery code for each dispatched shipment. The server sends
/// it only to the buyer and only while the pack is on its way (C-26: sealed
/// pack handed over against the code).
class HandoverCodeCard extends StatelessWidget {
  final List<Map<String, dynamic>> shipments;
  const HandoverCodeCard({super.key, required this.shipments});

  static List<Map<String, dynamic>> withCode(List<Map<String, dynamic>> shipments) => shipments
      .where((s) => (s['handover_code']?.toString().trim() ?? '').isNotEmpty)
      .toList();

  @override
  Widget build(BuildContext context) {
    final coded = withCode(shipments);
    if (coded.isEmpty) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppTheme.amberBadge,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.orange.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.verified_user_outlined, color: AppTheme.amberText, size: 20),
              SizedBox(width: 8),
              Text('Delivery code',
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: AppTheme.amberText)),
            ],
          ),
          const SizedBox(height: 10),
          for (final s in coded) ...[
            if (coded.length > 1)
              Text(_seller(s), style: const TextStyle(fontSize: 12, color: AppTheme.amberText)),
            SelectableText(
              s['handover_code'].toString(),
              style: const TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w800,
                letterSpacing: 8,
                color: AppTheme.amberText,
              ),
            ),
            if ((s['seal_number']?.toString() ?? '').isNotEmpty)
              Text('Seal no. ${s['seal_number']}',
                  style: const TextStyle(fontSize: 12, color: AppTheme.amberText)),
            const SizedBox(height: 8),
          ],
          const Text(
            'Give this code only when you receive the sealed pack. Do not accept a pack '
            'whose seal is broken or does not match.',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: AppTheme.amberText),
          ),
        ],
      ),
    );
  }

  static String _seller(Map<String, dynamic> s) {
    if (s['seller_type'] == 'dawabag') return 'From Dawabag';
    final name = s['seller_name']?.toString().trim() ?? '';
    return name.isEmpty ? 'From a partner pharmacy' : 'From $name';
  }
}
