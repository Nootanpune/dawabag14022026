import 'package:agora_rtc_engine/agora_rtc_engine.dart';
import 'package:flutter/material.dart';

/// The other person, full size. Shows a placeholder until they join, and for
/// audio-only consultations.
class RemoteView extends StatelessWidget {
  final RtcEngine? engine;
  final String channel;
  final int? remoteUid;
  final bool withVideo;
  final String otherPerson;

  const RemoteView({
    super.key,
    required this.engine,
    required this.channel,
    required this.remoteUid,
    required this.withVideo,
    required this.otherPerson,
  });

  @override
  Widget build(BuildContext context) {
    final engine = this.engine;
    final uid = remoteUid;
    if (withVideo && engine != null && uid != null) {
      return AgoraVideoView(
        key: ValueKey(uid),
        controller: VideoViewController.remote(
          rtcEngine: engine,
          canvas: VideoCanvas(uid: uid),
          connection: RtcConnection(channelId: channel),
        ),
      );
    }
    return Container(
      color: Colors.grey.shade900,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(withVideo ? Icons.person : Icons.call, size: 72, color: Colors.white38),
          const SizedBox(height: 8),
          Text(
            uid == null ? 'Waiting for $otherPerson' : 'Audio call with $otherPerson',
            style: const TextStyle(color: Colors.white70),
          ),
        ],
      ),
    );
  }
}
