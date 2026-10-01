import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/consultation.dart';

/// How long the secure call link from GET /consultations/:id/join stays valid
/// (Sprint 13, C-23). The channel name alone never lets anyone in; the server
/// issues a token for this person only. When the video provider is not set up
/// on the server the token is null and that is said plainly.
class CallLinkNotice extends StatelessWidget {
  final ConsultJoin join;
  const CallLinkNotice({super.key, required this.join});

  @override
  Widget build(BuildContext context) {
    final ok = join.hasToken;
    final minutes = join.tokenMinutes;
    final text = ok
        ? 'Secure call link valid for $minutes minute${minutes == 1 ? '' : 's'}.'
        : 'The video service is not set up yet, so a secure call link could not be '
            'issued. Please contact support.';
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ok ? AppTheme.brandGreen50 : AppTheme.amberBadge,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(ok ? Icons.lock_outline : Icons.warning_amber_rounded,
              size: 18, color: ok ? AppTheme.brandGreen700 : AppTheme.amberText),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: TextStyle(fontSize: 13, color: ok ? AppTheme.brandGreen700 : AppTheme.amberText),
            ),
          ),
        ],
      ),
    );
  }
}
