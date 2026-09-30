import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';

/// Pick a delivery address (from GET /users/me/addresses).
class AddressStep extends StatelessWidget {
  final List<Map<String, dynamic>> addresses;
  final String? selectedId;
  final void Function(String) onSelect;

  const AddressStep({
    super.key,
    required this.addresses,
    required this.selectedId,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    if (addresses.isEmpty) {
      return Center(
        child: Column(
          children: [
            const SizedBox(height: 40),
            const Icon(Icons.location_off, size: 48, color: Colors.grey),
            const SizedBox(height: 12),
            const Text('No saved addresses', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            OutlinedButton(
                onPressed: () => context.push('/account'), child: const Text('Add address')),
          ],
        ),
      );
    }
    return Column(
      children: addresses.map<Widget>((addr) => _tile(addr)).toList(),
    );
  }

  Widget _tile(Map<String, dynamic> addr) {
    final id = addr['id']?.toString() ?? '';
    final selected = selectedId == id;
    final line2 = addr['address_line2'];
    return GestureDetector(
      onTap: () => onSelect(id),
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          border: Border.all(
            color: selected ? AppTheme.brandGreen : Colors.grey.shade200,
            width: selected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
          color: selected ? AppTheme.brandGreen50 : Colors.white,
        ),
        child: Row(
          children: [
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                    color: selected ? AppTheme.brandGreen : Colors.grey.shade400, width: 2),
                color: selected ? AppTheme.brandGreen : Colors.transparent,
              ),
              child: selected ? const Icon(Icons.check, size: 12, color: Colors.white) : null,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${addr['label']} — ${addr['full_name']}',
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                  const SizedBox(height: 3),
                  Text(
                    '${addr['address_line1']}${line2 != null ? ', $line2' : ''}, '
                    '${addr['city']} — ${addr['pincode']}',
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
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
