import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../models/consultation.dart';
import '../../providers/consultation_provider.dart';
import '../../utils/consult_format.dart';
import '../../utils/formatters.dart';
import '../../widgets/error_retry_view.dart';
import 'consult_payment.dart';
import '../../widgets/payments/demo_payment_sheet.dart';
import 'widgets/cancel_consultation_dialog.dart';
import 'widgets/consultation_card.dart';

/// /consultations — the patient's teleconsultations with pay, join, cancel
/// and e-prescription actions (C-22..C-24). Everything comes from the server
/// and is reloaded on open, on pull and after every action.
class MyConsultationsScreen extends ConsumerStatefulWidget {
  const MyConsultationsScreen({super.key});

  @override
  ConsumerState<MyConsultationsScreen> createState() => _MyConsultationsScreenState();
}

class _MyConsultationsScreenState extends ConsumerState<MyConsultationsScreen> {
  late final ConsultPayment _payment;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _payment = ConsultPayment(
      onPaid: () {
        _snack('Payment received. Your consultation is confirmed.');
        _reload();
      },
      onError: (message) {
        _snack(message, isError: true);
        _reload();
      },
      onBusy: (busy) {
        if (mounted) setState(() => _busy = busy);
      },
      chooseDemo: (options, feePaise, pay) => showDemoPaymentSheet(context,
          amountPaise: feePaise, methods: options.methods, providers: options.providers, onPay: pay),
    );
    Future.microtask(_reload);
  }

  @override
  void dispose() {
    _payment.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    if (!mounted) return;
    await ref.read(myConsultationsProvider.notifier).load();
  }

  void _snack(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: isError ? Colors.red : null,
    ));
  }

  Future<void> _cancel(Consultation c) async {
    final reason = await askCancelReason(context);
    if (reason == null || !mounted) return;
    setState(() => _busy = true);
    try {
      final result = await ref.read(myConsultationsProvider.notifier).cancel(c.id, reason);
      final refund = result['refund'];
      if (refund is Map) {
        final amount = refund['amount_paise'];
        final paise = amount is num ? amount.round() : int.tryParse('$amount') ?? c.feePaise;
        // { pending: true } — the gateway refund is queued and retried by the server
        _snack(refund['pending'] == true
            ? 'Consultation cancelled. Refund of ${formatPrice(paise)} initiated.'
            : 'Consultation cancelled. ${formatPrice(paise)} will be refunded to the way you paid.');
      } else {
        _snack('Consultation cancelled.');
      }
    } catch (e) {
      _snack(consultErrorMessage(e, fallback: 'Could not cancel this consultation'), isError: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _join(Consultation c) async {
    await context.push('/consultations/${c.id}/join');
    await _reload();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(myConsultationsProvider);
    final notifier = ref.read(myConsultationsProvider.notifier);

    Widget body;
    if (!state.loaded && state.isLoading) {
      body = const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen));
    } else if (state.error != null && state.consultations.isEmpty) {
      body = ErrorRetryView(message: state.error!, onRetry: notifier.load);
    } else {
      body = RefreshIndicator(
        color: AppTheme.brandGreen,
        onRefresh: notifier.load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(
              'Join from 15 minutes before your slot once the fee is paid. You can cancel up to '
              '2 hours before the slot.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 12),
            if (state.isLoading || _busy) const LinearProgressIndicator(color: AppTheme.brandGreen),
            if (state.consultations.isEmpty)
              _NoConsultations(onFind: () => context.push('/doctors'))
            else
              ...state.consultations.map((c) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: ConsultationCard(
                      consultation: c,
                      busy: _busy,
                      onPay: () => _payment.pay(c.id, doctorName: c.doctorName, feePaise: c.feePaise),
                      onJoin: () => _join(c),
                      onCancel: () => _cancel(c),
                      onPrescription: () =>
                          context.push('/consultations/prescriptions/${c.prescriptionId}'),
                    ),
                  )),
            const SizedBox(height: 72),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('My consultations'),
        actions: [IconButton(icon: const Icon(Icons.refresh), onPressed: notifier.load)],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/doctors'),
        backgroundColor: AppTheme.brandGreen,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add),
        label: const Text('Consult a doctor'),
      ),
      body: body,
    );
  }
}

class _NoConsultations extends StatelessWidget {
  final VoidCallback onFind;
  const _NoConsultations({required this.onFind});

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Icon(Icons.video_call_outlined, size: 40, color: Colors.grey.shade400),
              const SizedBox(height: 10),
              const Text('No consultations yet', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(
                'Book a video, audio or chat consultation with a registered doctor.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
              const SizedBox(height: 8),
              TextButton(onPressed: onFind, child: const Text('Find a doctor')),
            ],
          ),
        ),
      );
}
