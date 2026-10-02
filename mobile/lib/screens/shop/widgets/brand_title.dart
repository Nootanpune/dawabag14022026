import 'package:flutter/material.dart';

import '../../../config/theme.dart';

/// DAWA | BAG wordmark for the home app bar (Sprint 35: the owner's logo
/// without its tagline; provenance in assets/brand/README.md).
class BrandTitle extends StatelessWidget {
  const BrandTitle({super.key});

  static const assetPath = 'assets/brand/wordmark.png';

  @override
  Widget build(BuildContext context) => Align(
        alignment: Alignment.centerLeft,
        child: Image.asset(
          assetPath,
          height: 32,
          width: 32 * 239 / 110.5,
          fit: BoxFit.contain,
          semanticLabel: 'DAWA BAG',
          errorBuilder: (context, _, __) => const Text.rich(
            TextSpan(children: [
              TextSpan(text: 'DAWA', style: TextStyle(color: AppTheme.brandTeal)),
              TextSpan(text: 'BAG', style: TextStyle(color: AppTheme.brandLeafDark)),
            ]),
            style: TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      );
}
