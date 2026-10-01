import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../../config/theme.dart';
import '../../../models/consultation.dart';
import '../../../providers/consultation_provider.dart';
import '../../../services/video_call_service.dart';
import '../../../utils/consult_format.dart';
import '../../../widgets/error_retry_view.dart';
import 'widgets/call_controls.dart';
import 'widgets/call_status_banner.dart';
import 'widgets/local_preview.dart';
import 'widgets/remote_view.dart';

/// /consultations/:id/call — the in-app audio/video consultation (Mobile
/// Sprint 14). Used by both sides (Sprint 15): the patient arrives from the
/// join screen, whose [consultJoinProvider] already holds the join details;
/// the doctor arrives from the doctor's consultation list with the details in
/// [initialJoin] (role 'doctor'), so nothing is fetched twice. Opened
/// directly, it asks the server. C-23: private between the patient and the
/// consultation's doctor; never recorded. The join details stay in memory.
class VideoCallScreen extends ConsumerWidget {
  final String consultationId;

  /// Join details already fetched by the caller (GET /consultations/:id/join).
  final ConsultJoin? initialJoin;

  const VideoCallScreen({super.key, required this.consultationId, this.initialJoin});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ready = initialJoin;
    if (ready != null) return _CallView(consultationId: consultationId, join: ready);
    final async = ref.watch(consultJoinProvider(consultationId));
    return async.when(
      loading: () => const Scaffold(
        backgroundColor: Colors.black,
        body: Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
      ),
      error: (e, _) => Scaffold(
        appBar: AppBar(title: const Text('Consultation call')),
        body: ErrorRetryView(
          message: consultErrorMessage(e, fallback: 'Could not open this consultation'),
          onRetry: () => ref.invalidate(consultJoinProvider(consultationId)),
        ),
      ),
      data: (j) => _CallView(consultationId: consultationId, join: j),
    );
  }
}

class _CallView extends StatefulWidget {
  final String consultationId;
  final ConsultJoin join;
  const _CallView({required this.consultationId, required this.join});

  @override
  State<_CallView> createState() => _CallViewState();
}

class _CallViewState extends State<_CallView> {
  late final VideoCallService _call;

  @override
  void initState() {
    super.initState();
    _call = VideoCallService(consultationId: widget.consultationId, join: widget.join);
    _call.start();
  }

  @override
  void dispose() {
    // Leaving the screen any way (back, route change) leaves the channel and
    // frees the camera and microphone.
    _call.dispose();
    super.dispose();
  }

  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      // Back to the list this person joined from (C-22: the doctor's own list).
      context.go(widget.join.role == 'doctor' ? '/doctor/consultations' : '/consultations');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: ListenableBuilder(
          listenable: _call,
          builder: (context, _) {
            final engine = _call.engine;
            return Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
                  child: Row(
                    children: [
                      Text('${consultModeLabel(widget.join.mode)} consultation',
                          style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
                      const Spacer(),
                      Text('Private · not recorded', style: TextStyle(color: Colors.grey.shade400, fontSize: 11)),
                    ],
                  ),
                ),
                Expanded(
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: RemoteView(
                          engine: engine,
                          channel: widget.join.channel,
                          remoteUid: _call.remoteUid,
                          withVideo: _call.withVideo,
                          otherPerson: _call.otherPerson,
                        ),
                      ),
                      if (_call.withVideo && engine != null)
                        Positioned(
                          right: 12,
                          bottom: 12,
                          width: 110,
                          height: 160,
                          child: LocalPreview(engine: engine, camOn: _call.camOn),
                        ),
                    ],
                  ),
                ),
                CallStatusBanner(phase: _call.phase, otherPerson: _call.otherPerson, message: _call.message),
                if (_call.permissionBlocked)
                  TextButton(
                    onPressed: openAppSettings,
                    child: const Text('Open settings', style: TextStyle(color: Colors.white)),
                  ),
                if (_call.isOver)
                  Padding(
                    padding: const EdgeInsets.all(16),
                    child: OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: Colors.white, side: const BorderSide(color: Colors.white54)),
                      onPressed: _close,
                      child: const Text('Close'),
                    ),
                  )
                else
                  CallControls(
                    withVideo: _call.withVideo,
                    micOn: _call.micOn,
                    camOn: _call.camOn,
                    enabled: engine != null && _call.phase != CallPhase.connecting,
                    onToggleMic: _call.toggleMic,
                    onToggleCam: _call.toggleCam,
                    onLeave: () async {
                      await _call.leave();
                      if (mounted) _close();
                    },
                  ),
              ],
            );
          },
        ),
      ),
    );
  }
}
