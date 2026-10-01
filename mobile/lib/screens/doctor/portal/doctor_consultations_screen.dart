import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/doctor_consultation.dart';
import '../../../providers/doctor_consultation_provider.dart';
import '../../../services/video_call_service.dart';
import '../../../utils/consult_format.dart';
import '../../../widgets/error_retry_view.dart';
import 'widgets/day_bar.dart';
import 'widgets/doctor_consultation_card.dart';
import 'widgets/end_consultation_dialog.dart';

/// /doctor/consultations — the signed-in doctor's consultations for one day
/// (today by default) with Join and End actions (Mobile Sprint 15).
///
/// C-22: only the consultation's own verified doctor gets the list or can
/// join; the server checks this on every request. C-23: "Join" asks GET
/// /consultations/:id/join for a call token bound to this channel and this
/// doctor, then opens the shared call screen with it (not recorded). The
/// server's refusal (402 fee unpaid, 409 too early / over) is shown as is.
/// Everything is reloaded from the server on open, on pull and after every
/// action; nothing is stored on the device.
class DoctorConsultationsScreen extends ConsumerStatefulWidget {
  const DoctorConsultationsScreen({super.key});

  @override
  ConsumerState<DoctorConsultationsScreen> createState() => _DoctorConsultationsScreenState();
}

class _DoctorConsultationsScreenState extends ConsumerState<DoctorConsultationsScreen> {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(_reload);
  }

  Future<void> _reload() async {
    if (!mounted) return;
    await ref.read(doctorConsultationsProvider.notifier).load();
  }

  void _snack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: isError ? Colors.red : null,
    ));
  }

  Future<void> _join(DoctorConsultation c) async {
    setState(() => _busy = true);
    try {
      final join = await ref.read(doctorConsultationsProvider.notifier).join(c.id);
      if (!mounted) return;
      setState(() => _busy = false);
      if (!VideoCallService.canCall(join)) {
        _snack(
          join.mode == 'text'
              ? 'In-app chat consultations are not available in this version of the app yet.'
              : 'The call cannot start until the video service is set up. Please contact support.',
          isError: true,
        );
      } else {
        // The join details go with the route so the call screen does not ask again.
        await context.push('/consultations/${c.id}/call', extra: join);
      }
    } catch (e) {
      _snack(consultErrorMessage(e, fallback: 'Could not join this consultation'), isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
      await _reload();
    }
  }

  Future<void> _end(DoctorConsultation c) async {
    final notes = await askEndConsultation(context);
    if (notes == null || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(doctorConsultationsProvider.notifier).end(c.id, notes: notes);
      _snack('Consultation ended. Write the e-prescription on the Dawabag website.');
    } catch (e) {
      _snack(consultErrorMessage(e, fallback: 'Could not end this consultation'), isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(doctorConsultationsProvider);
    final notifier = ref.read(doctorConsultationsProvider.notifier);
    final today = indiaToday();

    Widget list;
    if (!state.loaded && state.isLoading) {
      list = const Padding(
        padding: EdgeInsets.only(top: 48),
        child: Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
      );
    } else if (state.error != null && state.consultations.isEmpty) {
      list = Padding(
        padding: const EdgeInsets.only(top: 24),
        child: ErrorRetryView(message: state.error!, onRetry: notifier.load),
      );
    } else if (state.consultations.isEmpty) {
      list = _NoConsultations(isToday: state.day == today);
    } else {
      list = Column(
        children: state.consultations
            .map((c) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: DoctorConsultationCard(
                    consultation: c,
                    busy: _busy,
                    onJoin: () => _join(c),
                    onEnd: () => _end(c),
                  ),
                ))
            .toList(),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(state.day == today ? "Today's consultations" : 'Consultations'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: notifier.load)],
      ),
      body: RefreshIndicator(
        color: AppTheme.brandGreen,
        onRefresh: notifier.load,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
          children: [
            DayBar(
              day: state.day,
              today: today,
              onChanged: (d) => notifier.load(day: d),
            ),
            Text(
              'Times are India time. You can join from 15 minutes before the slot once the '
              'patient has paid. Calls are private and not recorded.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 12),
            if ((state.isLoading && state.loaded) || _busy)
              const LinearProgressIndicator(color: AppTheme.brandGreen),
            if (state.error != null && state.consultations.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Text(state.error!, style: const TextStyle(fontSize: 12, color: Colors.red)),
              ),
            list,
          ],
        ),
      ),
    );
  }
}

class _NoConsultations extends StatelessWidget {
  final bool isToday;
  const _NoConsultations({required this.isToday});

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Icon(Icons.event_available, size: 40, color: Colors.grey.shade400),
              const SizedBox(height: 10),
              Text(isToday ? 'No consultations today' : 'No consultations on this day',
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(
                'Booked consultations appear here. Manage your slots on the Dawabag website.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            ],
          ),
        ),
      );
}
