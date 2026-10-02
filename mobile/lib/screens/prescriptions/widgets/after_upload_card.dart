import 'package:flutter/material.dart';

import '../../../config/theme.dart';

/// After an upload: add the medicines on it, then choose it at checkout (C-08).
class AfterUploadCard extends StatelessWidget {
  final VoidCallback onFindMedicines;
  const AfterUploadCard({super.key, required this.onFindMedicines});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.brandTeal50,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.brandTeal100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Row(children: [
            Icon(Icons.check_circle, color: AppTheme.brandTeal700),
            SizedBox(width: 8),
            Text('Prescription uploaded', style: TextStyle(fontWeight: FontWeight.w700, color: AppTheme.brandTeal700)),
          ]),
          const SizedBox(height: 6),
          const Text('Now add the medicines from your prescription to your cart.'),
          const SizedBox(height: 10),
          ElevatedButton.icon(
            onPressed: onFindMedicines,
            icon: const Icon(Icons.search, size: 20),
            label: const Text('Find my medicines'),
          ),
          const SizedBox(height: 8),
          Text('At checkout, choose this prescription. Our pharmacist checks it against your order before anything is dispatched.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
        ],
      ),
    );
  }
}
