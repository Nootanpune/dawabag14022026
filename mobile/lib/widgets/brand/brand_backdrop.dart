import 'package:flutter/material.dart';

import '../../config/theme.dart';

/// Soft brand shapes behind the sign-in pages: a pale teal circle top right and
/// a pale green one bottom left, taken from the logo's colours. (The mock-ups'
/// illustration is not used: its licence is not known.)
class BrandBackdrop extends StatelessWidget {
  final Widget child;
  const BrandBackdrop({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Stack(
      children: [
        Positioned.fill(child: ColoredBox(color: dark ? AppTheme.darkPage : Colors.white)),
        Positioned(
            top: -90,
            right: -70,
            child: _circle(240, dark ? AppTheme.brandTealLogo.withValues(alpha: 0.12) : AppTheme.brandTeal50)),
        Positioned(
            bottom: -110,
            left: -80,
            child: _circle(260, dark ? AppTheme.brandLeaf.withValues(alpha: 0.12) : AppTheme.brandLeaf50)),
        Positioned.fill(child: child),
      ],
    );
  }

  static Widget _circle(double size, Color colour) => ExcludeSemantics(
        child: Container(width: size, height: size, decoration: BoxDecoration(color: colour, shape: BoxShape.circle)),
      );
}
