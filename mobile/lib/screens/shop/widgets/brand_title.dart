import 'package:flutter/material.dart';

import '../../../config/theme.dart';

/// "D" mark + "dawabag" wordmark for the home app bar.
class BrandTitle extends StatelessWidget {
  const BrandTitle({super.key});

  @override
  Widget build(BuildContext context) {
    return Row(children: [
      Container(
        width: 28,
        height: 28,
        decoration: BoxDecoration(
          color: AppTheme.brandGreen,
          borderRadius: BorderRadius.circular(7),
        ),
        child: const Center(
          child: Text('D', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
        ),
      ),
      const SizedBox(width: 8),
      const Text('dawabag', style: TextStyle(color: AppTheme.brandGreen, fontWeight: FontWeight.w700)),
    ]);
  }
}
