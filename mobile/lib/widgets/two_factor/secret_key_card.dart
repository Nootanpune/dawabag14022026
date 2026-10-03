import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../config/theme.dart';
import '../../models/two_factor.dart';

/// The set-up key in groups of four, for typing into an authenticator app on
/// this phone (Sprint 42). The server draws a QR code too, but this app has no
/// SVG renderer, so the key is given as text. Shown from memory only; never saved.
class SecretKeyCard extends StatelessWidget {
  final TwoFactorEnrolment enrolment;
  const SecretKeyCard({super.key, required this.enrolment});

  Future<void> _copy(BuildContext context) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      await Clipboard.setData(ClipboardData(text: enrolment.secret.replaceAll(' ', '')));
      messenger.showSnackBar(const SnackBar(content: Text('Key copied. Paste it into your authenticator app.')));
    } catch (_) {
      messenger.showSnackBar(const SnackBar(content: Text('Could not copy; type the key in instead')));
    }
  }

  @override
  Widget build(BuildContext context) => Container(
        key: const Key('two-factor-secret'),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: AppTheme.brandTeal50,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: AppTheme.brandTeal100),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Key to type in (${enrolment.issuer}, time-based, 6 digits)',
              style: TextStyle(fontSize: 13, color: AppTheme.muted(context))),
          const SizedBox(height: 8),
          Wrap(
            alignment: WrapAlignment.center,
            spacing: 10,
            runSpacing: 6,
            children: [
              for (final g in enrolment.secretGroups)
                Text(g, style: const TextStyle(fontFamily: 'monospace', fontSize: 17, fontWeight: FontWeight.w600, letterSpacing: 1.5)),
            ],
          ),
          if (enrolment.account.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text('Account: ${enrolment.account}',
                textAlign: TextAlign.center, style: TextStyle(fontSize: 12.5, color: AppTheme.muted(context))),
          ],
          Align(
            alignment: Alignment.center,
            child: TextButton.icon(
              onPressed: () => _copy(context),
              icon: const Icon(Icons.copy, size: 16),
              label: const Text('Copy key'),
            ),
          ),
        ]),
      );
}
