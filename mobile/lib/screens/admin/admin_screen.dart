import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../account/two_factor/two_factor_settings_screen.dart' show kTwoFactorSettingsPath;

class AdminScreen extends StatelessWidget {
  const AdminScreen({super.key});
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Admin panel')),
    body: Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Text('Use web dashboard for full admin', style: TextStyle(color: Colors.grey)),
        const SizedBox(height: 16),
        // Sprint 42: an admin's own two-step sign-in
        TextButton.icon(
          onPressed: () => context.push(kTwoFactorSettingsPath),
          icon: const Icon(Icons.verified_user_outlined),
          label: const Text('Two-step sign-in'),
        ),
      ]),
    ),
  );
}
