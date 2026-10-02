import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';

/// /doctor/portal — where a signed-in doctor lands (Mobile Sprint 15). The app
/// lets the doctor see the day's consultations and join or end the call
/// (C-22, C-23). Profile, slots and writing e-prescriptions stay on the
/// Dawabag website.
class DoctorPortalScreen extends StatelessWidget {
  const DoctorPortalScreen({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Doctor portal')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: ListTile(
                leading: const Icon(Icons.video_call_outlined, color: AppTheme.brandTeal),
                title: const Text("Today's consultations", style: TextStyle(fontWeight: FontWeight.w600)),
                subtitle: const Text('See your patients for the day and join the call'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => context.push('/doctor/consultations'),
              ),
            ),
            const SizedBox(height: 12),
            Text(
              'Write e-prescriptions, manage your profile and open slots on the Dawabag website.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
        ),
      );
}
