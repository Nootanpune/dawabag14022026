import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import 'register_controller.dart';
import 'register_widgets.dart';

/// Final screen for B2B / doctor accounts after documents are uploaded.
class SubmittedView extends StatelessWidget {
  final RegisterController c;
  const SubmittedView({super.key, required this.c});

  @override
  Widget build(BuildContext context) {
    final days = c.isWholesaler ? '2–3' : '1–2';
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 32),
        Center(
          child: Container(
            width: 72,
            height: 72,
            decoration: const BoxDecoration(
              color: AppTheme.brandGreen50,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.task_alt, color: AppTheme.brandGreen, size: 40),
          ),
        ),
        const SizedBox(height: 20),
        const Text('Application submitted',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const SizedBox(height: 12),
        Text(
          'Our team will verify your documents within $days working days. '
          "You'll get an SMS and email once approved.",
          textAlign: TextAlign.center,
          style: TextStyle(fontSize: 14.5, color: Colors.grey.shade700, height: 1.4),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: AppTheme.amberBadge,
            borderRadius: BorderRadius.circular(10),
          ),
          child: const Text(
            'Until then you can browse products; ordering opens once your account is approved.',
            textAlign: TextAlign.center,
            style: TextStyle(color: AppTheme.amberText, fontSize: 13.5),
          ),
        ),
        const SizedBox(height: 28),
        RegisterPrimaryButton('Start browsing', () => c.finish()),
      ],
    );
  }
}
