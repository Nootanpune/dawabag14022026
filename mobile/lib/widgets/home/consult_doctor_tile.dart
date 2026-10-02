import 'package:flutter/material.dart';

import '../../config/theme.dart';

/// Smaller entry to teleconsultation (the doctor directory, C-22..C-24).
class ConsultDoctorTile extends StatelessWidget {
  final VoidCallback onTap;
  const ConsultDoctorTile({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: Colors.grey.shade200),
      ),
      child: ListTile(
        onTap: onTap,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        leading: const Icon(Icons.video_call_outlined, color: AppTheme.brandTeal),
        title: const Text('Consult a doctor',
            style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        subtitle: const Text('Video or audio consultation with a registered doctor',
            style: TextStyle(fontSize: 12)),
        trailing: const Icon(Icons.chevron_right),
        dense: true,
      ),
    );
  }
}
