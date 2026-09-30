import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/theme.dart';
import '../../../providers/privacy_provider.dart';
import '../../../widgets/error_retry_view.dart';
import '../../auth/register/register_constants.dart' show kPrivacyNoticeUrl;
import 'consent_section.dart';
import 'data_requests_section.dart';
import 'data_rights_section.dart';

/// /account/privacy — consents and data-principal rights (C-40..C-44).
/// Consents are read from and written to the server's append-only log;
/// nothing is stored on the device and no file is written.
class PrivacyScreen extends ConsumerStatefulWidget {
  const PrivacyScreen({super.key});

  @override
  ConsumerState<PrivacyScreen> createState() => _PrivacyScreenState();
}

class _PrivacyScreenState extends ConsumerState<PrivacyScreen> {
  bool _requesting = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref.read(privacyProvider.notifier).load());
  }

  void _snack(String message, {bool error = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: error ? Colors.red : null),
    );
  }

  Future<void> _setMarketing(bool granted) async {
    final error = await ref.read(privacyProvider.notifier).setMarketing(granted);
    _snack(error ?? (granted ? 'Marketing messages turned on' : 'Marketing messages turned off'),
        error: error != null);
  }

  Future<void> _request(String type) async {
    final erasure = type == 'erasure';
    final details = await askDataRequestDetails(
      context,
      title: erasure ? 'Delete my account data?' : 'Correct my data',
      message: erasure
          ? 'We will erase your personal data and close your account. Tax invoices, '
              'prescriptions and the Schedule H1 register are kept as the law requires. '
              'Orders in progress and unpaid credit must be settled first.'
          : 'Tell us which details are wrong and what they should be.',
      confirmLabel: erasure ? 'Request deletion' : 'Send request',
      hint: erasure ? 'Reason (optional)' : 'e.g. my name is spelt …',
      destructive: erasure,
    );
    if (details == null || !mounted) return;
    setState(() => _requesting = true);
    final error = await ref.read(privacyProvider.notifier).request(type, details: details);
    if (!mounted) return;
    setState(() => _requesting = false);
    if (error == null) ref.invalidate(dataRequestsProvider);
    _snack(
      error ??
          (erasure
              ? 'Deletion request received. Our team will review it.'
              : 'Correction request received. Our team will review it.'),
      error: error != null,
    );
  }

  Future<void> _openNotice() async {
    final ok = await launchUrl(Uri.parse(kPrivacyNoticeUrl), mode: LaunchMode.externalApplication);
    if (!ok) _snack('Could not open the privacy notice', error: true);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(privacyProvider);
    final notifier = ref.read(privacyProvider.notifier);
    final consents = state.consents;

    Widget body;
    if (consents == null && state.error == null) {
      body = const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen));
    } else if (consents == null) {
      body = ErrorRetryView(message: state.error!, onRetry: notifier.load);
    } else {
      body = RefreshIndicator(
        color: AppTheme.brandGreen,
        onRefresh: () async {
          ref.invalidate(dataRequestsProvider);
          await notifier.load();
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (state.isUpdating || state.isLoading || _requesting)
              const LinearProgressIndicator(color: AppTheme.brandGreen),
            const _Heading('Your choices'),
            ConsentSection(
              consents: consents,
              busy: state.isUpdating,
              onMarketingChanged: _setMarketing,
            ),
            const SizedBox(height: 16),
            const _Heading('Your rights'),
            DataRightsSection(
              busy: _requesting,
              onCorrection: () => _request('correction'),
              onErasure: () => _request('erasure'),
              onOpenNotice: _openNotice,
            ),
            const DataRequestsSection(),
            const SizedBox(height: 24),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Privacy')),
      body: body,
    );
  }
}

class _Heading extends StatelessWidget {
  final String text;
  const _Heading(this.text);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 6, left: 4),
        child: Text(text.toUpperCase(),
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w700, color: Colors.grey.shade500, letterSpacing: 0.8)),
      );
}
