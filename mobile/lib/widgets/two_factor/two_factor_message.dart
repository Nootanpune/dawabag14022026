import 'package:flutter/material.dart';

import '../../config/theme.dart';

/// A sentence in a tinted box: the server's words after a wrong code, a pause,
/// a changed key — or a plain note (Sprint 42 two-step sign-in).
class TwoFactorMessage extends StatelessWidget {
  final String text;
  final bool isError;
  final IconData? icon;
  const TwoFactorMessage(this.text, {super.key, this.isError = true, this.icon});

  @override
  Widget build(BuildContext context) {
    final fg = isError ? const Color(0xFF8A1C1B) : AppTheme.brandTeal700;
    final bg = isError ? const Color(0xFFFDECEC) : AppTheme.brandTeal50;
    return Semantics(
      liveRegion: isError,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(10)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon ?? (isError ? Icons.error_outline : Icons.info_outline), size: 20, color: fg),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: TextStyle(fontSize: 13.5, height: 1.35, color: fg))),
        ]),
      ),
    );
  }
}
