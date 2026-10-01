import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/material.dart';

/// Own camera, small in the corner. uid 0 is the local user in the Agora canvas.
class LocalPreview extends StatelessWidget {
  final RtcEngine engine;
  final bool camOn;
  const LocalPreview({super.key, required this.engine, required this.camOn});

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: DecoratedBox(
        decoration: BoxDecoration(color: Colors.grey.shade900, border: Border.all(color: Colors.white24)),
        child: camOn
            ? AgoraVideoView(
                controller: VideoViewController(rtcEngine: engine, canvas: const VideoCanvas(uid: 0)),
              )
            : const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.videocam_off, color: Colors.white54),
                    SizedBox(height: 4),
                    Text('Camera off', style: TextStyle(color: Colors.white54, fontSize: 11)),
                  ],
                ),
              ),
      ),
    );
  }
}
