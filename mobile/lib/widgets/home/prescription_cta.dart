import 'package:flutter/material.dart';

import '../../config/theme.dart';

/// "Have a prescription?" card. The app uploads a prescription as part of an
/// order (checkout's prescription step, POST /prescriptions/upload), and a
/// registered pharmacist checks it before the order is dispatched (C-08).
/// [onUpload] leads the user into that existing flow.
class PrescriptionCta extends StatelessWidget {
  final VoidCallback onUpload;
  const PrescriptionCta({super.key, required this.onUpload});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.brandGreen100),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppTheme.brandGreen50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.description_outlined, color: AppTheme.brandGreen700),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Have a prescription?',
                        style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                    SizedBox(height: 4),
                    Text('Upload a photo. Our pharmacist checks it before dispatch.',
                        style: TextStyle(fontSize: 13, height: 1.35)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          ElevatedButton.icon(
            onPressed: onUpload,
            icon: const Icon(Icons.upload_file, size: 20),
            label: const Text('Upload prescription'),
          ),
        ],
      ),
    );
  }
}
