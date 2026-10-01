import 'package:flutter/material.dart';

/// Mute microphone, camera off, leave.
class CallControls extends StatelessWidget {
  final bool withVideo;
  final bool micOn;
  final bool camOn;
  final bool enabled;
  final VoidCallback onToggleMic;
  final VoidCallback onToggleCam;
  final VoidCallback onLeave;

  const CallControls({
    super.key,
    required this.withVideo,
    required this.micOn,
    required this.camOn,
    required this.enabled,
    required this.onToggleMic,
    required this.onToggleCam,
    required this.onLeave,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          _RoundButton(
            icon: micOn ? Icons.mic : Icons.mic_off,
            tooltip: micOn ? 'Mute microphone' : 'Unmute microphone',
            active: micOn,
            onPressed: enabled ? onToggleMic : null,
          ),
          if (withVideo) ...[
            const SizedBox(width: 20),
            _RoundButton(
              icon: camOn ? Icons.videocam : Icons.videocam_off,
              tooltip: camOn ? 'Turn camera off' : 'Turn camera on',
              active: camOn,
              onPressed: enabled ? onToggleCam : null,
            ),
          ],
          const SizedBox(width: 20),
          _RoundButton(
            icon: Icons.call_end,
            tooltip: 'Leave call',
            active: true,
            background: Colors.red.shade600,
            onPressed: onLeave,
          ),
        ],
      ),
    );
  }
}

class _RoundButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final bool active;
  final Color? background;
  final VoidCallback? onPressed;

  const _RoundButton({required this.icon, required this.tooltip, required this.active, this.background, this.onPressed});

  @override
  Widget build(BuildContext context) {
    final bg = background ?? (active ? Colors.white24 : Colors.white);
    final fg = background != null || active ? Colors.white : Colors.black87;
    return Tooltip(
      message: tooltip,
      child: RawMaterialButton(
        onPressed: onPressed,
        shape: const CircleBorder(),
        fillColor: onPressed == null ? bg.withAlpha(100) : bg,
        constraints: const BoxConstraints.tightFor(width: 56, height: 56),
        elevation: 0,
        child: Icon(icon, color: fg),
      ),
    );
  }
}
