import 'package:flutter/material.dart';

import '../../../models/drug_licence.dart';
import '../../../utils/ist.dart';

/// One drug licence: form, number, valid till, and a status chip
/// (expired in red, renew soon in amber).
class LicenceTile extends StatelessWidget {
  final DrugLicence licence;
  const LicenceTile({super.key, required this.licence});

  Color _chipColour() {
    if (licence.status == 'rejected' || licence.validity == 'expired') return Colors.red.shade100;
    if (licence.status == 'pending' || licence.validity == 'expiring') return Colors.amber.shade100;
    if (licence.validity == 'valid') return Colors.green.shade100;
    return Colors.grey.shade200;
  }

  @override
  Widget build(BuildContext context) {
    final l = licence;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(l.label, style: const TextStyle(fontWeight: FontWeight.w600))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(color: _chipColour(), borderRadius: BorderRadius.circular(12)),
                  child: Text(l.statusText, style: const TextStyle(fontSize: 11)),
                ),
              ],
            ),
            const SizedBox(height: 4),
            SelectableText(l.number, style: const TextStyle(fontFamily: 'monospace')),
            if (l.validUpto != null && l.validUpto!.isNotEmpty)
              Text('Valid till ${formatDateIst(l.validUpto)}', style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
            if (l.status == 'rejected' && (l.rejectionReason ?? '').isNotEmpty)
              Text('Reason: ${l.rejectionReason}', style: TextStyle(fontSize: 12, color: Colors.red.shade700)),
          ],
        ),
      ),
    );
  }
}
