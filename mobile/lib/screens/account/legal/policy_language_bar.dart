import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/policy.dart';

/// English / मराठी / हिंदी choice for reading a policy (C-40). The choice is
/// kept in the screen's memory only; the text is fetched from the server.
class PolicyLanguageBar extends StatelessWidget {
  final String value;
  final ValueChanged<String> onChanged;

  const PolicyLanguageBar({super.key, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      children: kPolicyLanguages.entries
          .map((e) => ChoiceChip(
                label: Text(e.value),
                selected: value == e.key,
                onSelected: (_) => onChanged(e.key),
                selectedColor: AppTheme.brandGreen100,
              ))
          .toList(),
    );
  }
}
