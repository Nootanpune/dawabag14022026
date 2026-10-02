import 'package:flutter/material.dart';

import '../../config/theme.dart';

/// The DAWA BAG logo with its tagline (owner's vector logo, Sprint 35;
/// provenance in assets/brand/README.md).
class BrandLogo extends StatelessWidget {
  final double width;
  const BrandLogo({super.key, this.width = 200});

  static const assetPath = 'assets/brand/logo.png';

  /// Height / width of the logo artwork (240 × 138), so the page does not jump while it loads.
  static const aspect = 138 / 240;
  static const semanticLabel = 'DAWA BAG — Your Life Saving Companion';

  @override
  Widget build(BuildContext context) {
    final logo = _image();
    // The tagline grey is made for a light background: in dark mode the logo sits on a white card
    if (Theme.of(context).brightness != Brightness.dark) return logo;
    return DecoratedBox(
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
      child: Padding(padding: const EdgeInsets.all(12), child: logo),
    );
  }

  Widget _image() => Image.asset(
        assetPath,
        width: width,
        height: width * aspect,
        fit: BoxFit.contain,
        semanticLabel: semanticLabel,
        // A missing asset should never block sign-in: show the name in brand colours
        errorBuilder: (context, _, __) => Semantics(
          label: semanticLabel,
          child: Text.rich(
            TextSpan(children: [
              TextSpan(text: 'DAWA', style: TextStyle(color: AppTheme.brandTealLogo, fontSize: width / 7)),
              TextSpan(text: 'BAG', style: TextStyle(color: AppTheme.brandLeaf, fontSize: width / 7)),
            ]),
            style: const TextStyle(fontWeight: FontWeight.w800),
          ),
        ),
      );
}
