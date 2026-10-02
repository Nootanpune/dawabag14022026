import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/address.dart';

/// One saved address with edit / delete / make-default actions and the
/// server's serviceability for its pincode.
class AddressTile extends StatelessWidget {
  final Address address;
  final bool busy;
  final VoidCallback onEdit;
  final VoidCallback onDelete;
  final VoidCallback onMakeDefault;

  const AddressTile({
    super.key,
    required this.address,
    required this.busy,
    required this.onEdit,
    required this.onDelete,
    required this.onMakeDefault,
  });

  @override
  Widget build(BuildContext context) {
    final a = address;
    return Card(
      margin: const EdgeInsets.only(bottom: 10),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(14, 12, 6, 6),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text('${a.label} — ${a.fullName}',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                ),
                if (a.isDefault)
                  Container(
                    margin: const EdgeInsets.only(right: 8),
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppTheme.brandTeal50,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Text('Default',
                        style: TextStyle(fontSize: 11, color: AppTheme.brandTeal700, fontWeight: FontWeight.w600)),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(a.oneLine, style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
            Text('+91 ${a.mobile}', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            const SizedBox(height: 4),
            Text(
              a.canDeliver
                  ? (a.estimatedDays != null
                      ? 'We deliver here (about ${a.estimatedDays} days)'
                      : 'We deliver here')
                  : 'We do not deliver to this pincode yet',
              style: TextStyle(
                  fontSize: 11, color: a.canDeliver ? AppTheme.brandTeal700 : Colors.orange.shade800),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                if (!a.isDefault)
                  TextButton(onPressed: busy ? null : onMakeDefault, child: const Text('Make default')),
                TextButton(onPressed: busy ? null : onEdit, child: const Text('Edit')),
                TextButton(
                  onPressed: busy ? null : onDelete,
                  child: const Text('Delete', style: TextStyle(color: Colors.red)),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
