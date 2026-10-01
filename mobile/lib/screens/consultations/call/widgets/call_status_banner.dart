import 'package:flutter/material.dart';

import '../../../../services/video_call_service.dart';

/// connecting / waiting for the other person / connected / ended / errors
class CallStatusBanner extends StatelessWidget {
  final CallPhase phase;
  final String otherPerson;
  final String? message;

  const CallStatusBanner({super.key, required this.phase, required this.otherPerson, this.message});

  String get _text => switch (phase) {
        CallPhase.connecting => 'Connecting…',
        CallPhase.waiting => 'Waiting for $otherPerson to join…',
        CallPhase.connected => 'Connected with $otherPerson',
        CallPhase.reconnecting => 'Connection lost — reconnecting…',
        CallPhase.ended => 'Call ended',
        CallPhase.error => 'The call could not continue',
      };

  @override
  Widget build(BuildContext context) {
    final busy = phase == CallPhase.connecting || phase == CallPhase.waiting || phase == CallPhase.reconnecting;
    final color = switch (phase) {
      CallPhase.error => Colors.red.shade200,
      CallPhase.connected => Colors.green.shade200,
      _ => Colors.white70,
    };
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
      child: Column(
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (busy) ...[
                const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white70)),
                const SizedBox(width: 8),
              ],
              Flexible(child: Text(_text, style: TextStyle(color: color, fontSize: 14))),
            ],
          ),
          if (message != null) ...[
            const SizedBox(height: 4),
            Text(message!, textAlign: TextAlign.center, style: TextStyle(color: Colors.amber.shade200, fontSize: 12)),
          ],
        ],
      ),
    );
  }
}
