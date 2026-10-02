import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../config/theme.dart';
import '../../models/refill.dart';
import '../../providers/refill_provider.dart';
import 'refills/mandate_checkout.dart';
import 'refills/mandate_section.dart';
import 'refills/refill_card.dart';
import 'refills/refill_dialogs.dart';

/// UX copy from the Sprint 3 contract (section D).
const String kRefillExplainer =
    "We'll remind you 3 days before each refill. On the refill date we place the order; "
    "if automatic payment is on, we charge your saved method — otherwise you'll get a link "
    'to pay. Prescription medicines are checked by our pharmacist before any charge.';

/// /account/refills — the buyer's refill subscriptions and automatic-payment
/// mandates. Everything shown comes from the server (no local storage) and
/// is reloaded after every action.
class RefillScreen extends ConsumerStatefulWidget {
  const RefillScreen({super.key});

  @override
  ConsumerState<RefillScreen> createState() => _RefillScreenState();
}

class _RefillScreenState extends ConsumerState<RefillScreen> {
  late final MandateCheckout _checkout;
  bool _starting = false;
  String? _mandateNote;

  @override
  void initState() {
    super.initState();
    _checkout = MandateCheckout(onSuccess: _onAuthorised, onError: _onAuthFailed);
    Future.microtask(() => ref.read(refillProvider.notifier).load());
  }

  @override
  void dispose() {
    _checkout.dispose();
    super.dispose();
  }

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: error ? Colors.red : null),
    );
  }

  void _onAuthorised(PaymentSuccessResponse response) {
    if (!mounted) return;
    setState(() => _mandateNote =
        'Authorisation received. Automatic payment turns on once your bank confirms it.');
    ref.read(refillProvider.notifier).refresh();
  }

  void _onAuthFailed(PaymentFailureResponse response) {
    if (!mounted) return;
    _snack('Authorisation was not completed${response.message != null ? ': ${response.message}' : ''}',
        error: true);
    ref.read(refillProvider.notifier).refresh();
  }

  Future<void> _turnOnAutomaticPayment() async {
    final maxPaise = await askMandateLimit(context);
    if (maxPaise == null || !mounted) return;
    setState(() {
      _starting = true;
      _mandateNote = null;
    });
    final result = await requestMandate(maxPaise);
    if (!mounted) return;
    setState(() => _starting = false);
    switch (result) {
      case MandateUnavailable():
        setState(() => _mandateNote = 'Automatic payment is not available yet');
      case MandateFailed(:final message):
        _snack(message, error: true);
      case MandateStarted(:final start):
        await ref.read(refillProvider.notifier).refresh();
        if (!mounted) return;
        await _completeAuthorisation(start);
    }
  }

  /// "Complete authorisation": opens Razorpay Checkout (recurring) with the
  /// values the server returned.
  Future<void> _completeAuthorisation(MandateStart start) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Complete authorisation'),
        content: Text(
          'Approve the UPI mandate in Razorpay to finish turning on automatic payment.\n\n'
          'Reference: ${start.razorpayOrderId}',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Later')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Continue')),
        ],
      ),
    );
    if (go != true || !mounted) return;
    try {
      if (!_checkout.open(start)) {
        setState(() => _mandateNote = 'Automatic payment is not available yet');
      }
    } catch (_) {
      _snack('Could not open the payment window. Please try again.', error: true);
    }
  }

  Future<void> _cancelMandate(PaymentMandate mandate) async {
    final ok = await confirmRefillAction(
      context,
      title: 'Turn off automatic payment?',
      message: 'Refills using this method will send you a link to pay instead.',
      confirmLabel: 'Turn off',
      destructive: true,
    );
    if (!ok || !mounted) return;
    final error = await ref.read(refillProvider.notifier).cancelMandate(mandate.id);
    _snack(error ?? 'Automatic payment turned off', error: error != null);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(refillProvider);
    final notifier = ref.read(refillProvider.notifier);
    final busy = state.isUpdating;

    Widget body;
    if (!state.loaded && state.isLoading) {
      body = const Center(child: CircularProgressIndicator(color: AppTheme.brandTeal));
    } else if (state.error != null && state.refills.isEmpty && state.mandates.isEmpty) {
      body = _ErrorView(message: state.error!, onRetry: notifier.load);
    } else {
      body = RefreshIndicator(
        color: AppTheme.brandTeal,
        onRefresh: notifier.load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text(kRefillExplainer, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
            const SizedBox(height: 12),
            if (busy) const LinearProgressIndicator(color: AppTheme.brandTeal),
            if (state.refills.isEmpty)
              const _EmptyRefills()
            else
              ...state.refills.map((r) => Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: RefillCard(refill: r, activeMandates: state.activeMandates, busy: busy),
                  )),
            const SizedBox(height: 6),
            MandateSection(
              mandates: state.mandates,
              busy: busy,
              starting: _starting,
              note: _mandateNote,
              onTurnOn: _turnOnAutomaticPayment,
              onCancel: _cancelMandate,
            ),
            const SizedBox(height: 24),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Refill subscriptions'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: busy ? null : notifier.load),
        ],
      ),
      body: body,
    );
  }
}

class _EmptyRefills extends StatelessWidget {
  const _EmptyRefills();

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              Icon(Icons.replay, size: 40, color: Colors.grey.shade400),
              const SizedBox(height: 10),
              const Text('No refills yet', style: TextStyle(fontWeight: FontWeight.w600)),
              const SizedBox(height: 4),
              Text(
                'Open a delivered order and tap "Refill every…" to get the same medicines on a schedule.',
                textAlign: TextAlign.center,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
              ),
            ],
          ),
        ),
      );
}

class _ErrorView extends StatelessWidget {
  final String message;
  final Future<void> Function() onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 12),
              SizedBox(width: 160, child: OutlinedButton(onPressed: onRetry, child: const Text('Try again'))),
            ],
          ),
        ),
      );
}
