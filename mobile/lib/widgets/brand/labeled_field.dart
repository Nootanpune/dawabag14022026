import 'package:flutter/material.dart';

import '../../config/theme.dart';

/// A form field with its label shown above it (design review: labels stay
/// visible above fields, never only as a hint inside).
class LabeledField extends StatelessWidget {
  final String label;
  final bool required;
  final Widget child;
  const LabeledField({super.key, required this.label, required this.child, this.required = false});

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.only(left: 16, bottom: 6),
            child: Text.rich(
              TextSpan(text: label, children: [
                if (required) const TextSpan(text: ' *', style: TextStyle(color: AppTheme.errorRed)),
              ]),
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppTheme.muted(context),
              ),
            ),
          ),
          child,
        ],
      );
}
