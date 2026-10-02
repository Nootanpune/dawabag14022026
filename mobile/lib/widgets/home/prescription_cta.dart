import 'package:flutter/material.dart';

import '../../config/theme.dart';

/// "Have a prescription?" card. [onUpload] opens the Prescriptions screen,
/// where it is uploaded any time and chosen at checkout; a registered
/// pharmacist checks it with the order before dispatch (C-08).
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
        border: Border.all(color: AppTheme.brandTeal100),
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
                  color: AppTheme.brandTeal50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.description_outlined, color: AppTheme.brandTeal700),
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
