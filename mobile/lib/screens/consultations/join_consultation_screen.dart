import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../models/consultation.dart';
import '../../providers/consultation_provider.dart';
import '../../services/video_call_service.dart';
import '../../utils/consult_format.dart';
import '../../widgets/error_retry_view.dart';
import 'widgets/call_link_notice.dart';

/// /consultations/:id/join — asks the server for the call room (GET
/// /consultations/:id/join). The server decides whether the patient may join
/// (fee paid, from 15 minutes before the slot) and its message is shown when
/// it refuses. For a video or audio consultation with a server-issued token
/// the "Start call" button opens /consultations/:id/call, which joins `channel`
/// as the user account `uid` with `token` (Sprint 13/14, C-23). Without a
/// token (video service not set up) the notice says so and no call starts;
/// chat consultations are not in the app yet.
class JoinConsultationScreen extends ConsumerWidget {
  final String consultationId;
  const JoinConsultationScreen({super.key, required this.consultationId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(consultJoinProvider(consultationId));
    void retry() => ref.invalidate(consultJoinProvider(consultationId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Join consultation'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: retry)],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) => ErrorRetryView(
          message: consultErrorMessage(e, fallback: 'Could not open this consultation'),
          onRetry: retry,
        ),
        data: (j) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Icon(_icon(j.mode), size: 56, color: AppTheme.brandGreen),
                    const SizedBox(height: 12),
                    Text(consultModeLabel(j.mode),
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text('Your room is ready', style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                    const Divider(height: 28),
                    _Row(label: 'Mode', value: consultModeLabel(j.mode)),
                    _Row(label: 'Room', value: j.channel),
                    _Row(label: 'Joining as', value: j.role == 'doctor' ? 'Doctor' : 'Patient'),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 12),
            CallLinkNotice(join: j),
            const SizedBox(height: 12),
            if (VideoCallService.canCall(j))
              FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: AppTheme.brandGreen,
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: () => context.push('/consultations/$consultationId/call'),
                icon: Icon(_icon(j.mode)),
                label: Text(j.mode == 'video' ? 'Start video call' : 'Start audio call'),
              )
            else
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppTheme.amberBadge,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.info_outline, size: 18, color: AppTheme.amberText),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        j.mode == 'text'
                            ? 'In-app chat consultations are not available in this version of the app yet.'
                            : 'The call cannot start until the video service is set up.',
                        style: const TextStyle(fontSize: 13, color: AppTheme.amberText),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            Text(
              'Keep your previous prescriptions and reports at hand. The doctor may ask you to '
              'see a doctor in person if a teleconsultation is not enough.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }

  static IconData _icon(String mode) => switch (mode) {
        'audio' => Icons.call,
        'text' => Icons.chat_bubble,
        _ => Icons.videocam,
      };
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  const _Row({required this.label, required this.value});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 4),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(
              width: 96,
              child: Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
            ),
            Expanded(
              child: SelectableText(value, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
            ),
          ],
        ),
      );
}
