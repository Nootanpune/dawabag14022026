import 'package:flutter/material.dart';

import 'brand_backdrop.dart';
import 'brand_logo.dart';

/// Layout shared by the welcome, sign-in, forgot-password and sign-up pages
/// (owner's mock-ups, Sprint 35): brand backdrop, the logo on top, then the
/// page's content in a column no wider than a phone.
class AuthPage extends StatelessWidget {
  final List<Widget> children;

  /// Shows a back arrow (pages opened on top of another).
  final bool showBack;
  final double logoWidth;
  const AuthPage({super.key, required this.children, this.showBack = false, this.logoWidth = 200});

  @override
  Widget build(BuildContext context) => Scaffold(
        body: BrandBackdrop(
          child: SafeArea(
            child: Stack(
              children: [
                Center(
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.fromLTRB(24, 32, 24, 32),
                    child: ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 420),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Center(child: BrandLogo(width: logoWidth)),
                          const SizedBox(height: 32),
                          ...children,
                        ],
                      ),
                    ),
                  ),
                ),
                if (showBack && Navigator.of(context).canPop()) const Positioned(top: 4, left: 4, child: BackButton()),
              ],
            ),
          ),
        ),
      );
}
