import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';

/// Pick a delivery address (from GET /users/me/addresses). Adding or
/// editing opens the account address screens, which save to the server and
/// reload the shared list.
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
                onPressed: () => context.push('/account/addresses/new'),
                child: const Text('Add address')),
          ],
        ),
      );
    }
    return Column(
      children: [
        ...addresses.map<Widget>((addr) => _tile(addr)),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            TextButton.icon(
              onPressed: () => context.push('/account/addresses/new'),
              icon: const Icon(Icons.add, size: 18),
              label: const Text('New address'),
            ),
            TextButton(
              onPressed: () => context.push('/account/addresses'),
              child: const Text('Manage addresses'),
            ),
          ],
        ),
      ],
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
            color: selected ? AppTheme.brandTeal : Colors.grey.shade200,
            width: selected ? 2 : 1,
          ),
          borderRadius: BorderRadius.circular(12),
          color: selected ? AppTheme.brandTeal50 : Colors.white,
        ),
        child: Row(
          children: [
            Container(
              width: 20,
              height: 20,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(
                    color: selected ? AppTheme.brandTeal : Colors.grey.shade400, width: 2),
                color: selected ? AppTheme.brandTeal : Colors.transparent,
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
                  if (addr['is_serviceable'] != true)
                    Text('We do not deliver to this pincode yet',
                        style: TextStyle(fontSize: 11, color: Colors.orange.shade800)),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
