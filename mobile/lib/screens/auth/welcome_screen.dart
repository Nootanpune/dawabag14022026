import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../widgets/brand/auth_page.dart';

/// First screen for someone not signed in (Sprint 35, owner's "Get started"
/// mock-up). Shown on every start while the saved session is checked; a
/// signed-in person is sent on to the shop by the router. Nothing is stored
/// on the phone to remember it was seen (server is the single source of truth).
class WelcomeScreen extends StatelessWidget {
  const WelcomeScreen({super.key});

  /// No "fastest delivery" claim: it cannot be shown to be true (C-17). Every
  /// order is checked by a pharmacist before it is sent (C-08).
  static const headline = 'Medicines delivered to your door, checked by a pharmacist';

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final dark = Theme.of(context).brightness == Brightness.dark;
    return AuthPage(
      logoWidth: 230,
      children: [
        const SizedBox(height: 8),
        Text(
          headline,
          textAlign: TextAlign.center,
          style: text.headlineSmall?.copyWith(
            fontWeight: FontWeight.w700,
            height: 1.25,
            color: dark ? null : const Color(0xFF2F2F2E),
          ),
        ),
        const SizedBox(height: 12),
        Text(
          'Upload your prescription, and a pharmacist checks it with your order before it is sent.',
          textAlign: TextAlign.center,
          style: text.bodyMedium?.copyWith(color: AppTheme.muted(context), height: 1.4),
        ),
        const SizedBox(height: 36),
        ElevatedButton(
          onPressed: () => context.go('/'),
          child: const Text('Get started'),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () => context.push('/auth/login'),
          child: const Text('Sign in'),
        ),
        const SizedBox(height: 8),
        TextButton(
          onPressed: () => context.push('/auth/register'),
          child: const Text('New here? Create an account'),
        ),
        const SizedBox(height: 16),
        const _BrandDots(),
      ],
    );
  }
}

/// Small teal and green bars echoing the logo's two halves (decoration only).
class _BrandDots extends StatelessWidget {
  const _BrandDots();

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          _bar(AppTheme.brandTealLogo),
          const SizedBox(width: 6),
          _bar(AppTheme.brandLeaf),
        ]),
      );

  static Widget _bar(Color c) => Container(
        width: 28,
        height: 6,
        decoration: BoxDecoration(color: c, borderRadius: BorderRadius.circular(3)),
      );
}
