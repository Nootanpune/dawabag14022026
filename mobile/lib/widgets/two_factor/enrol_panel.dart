import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/theme.dart';
import '../../models/two_factor.dart';
import '../../services/api_service.dart';
import '../../services/two_factor_api.dart';
import 'authenticator_code_field.dart';
import 'secret_key_card.dart';
import 'two_factor_message.dart';

/// Setting up an authenticator app (Sprint 42; C-41, C-43, C-46): a new key
/// from the server (POST /auth/2fa/enrol/start), added to the app by the
/// otpauth:// link or typed in, then the first code switches it on
/// (POST /auth/2fa/enrol/confirm). Used at sign-in with the 'enrol' challenge
/// ([challengeToken]) and signed in from the account page (no token).
///
/// [onEnrolled] receives the confirm answer's `data` (a new two-step session,
/// already stored by the API client, and the ten `recovery_codes` to show once).
class EnrolPanel extends StatefulWidget {
  final String? challengeToken;
  final ValueChanged<Map<String, dynamic>> onEnrolled;

  /// At sign-in: the challenge is gone on the server (expired) — leave with the sentence.
  final ValueChanged<String>? onChallengeEnded;

  const EnrolPanel({super.key, this.challengeToken, required this.onEnrolled, this.onChallengeEnded});

  @override
  State<EnrolPanel> createState() => _EnrolPanelState();
}

class _EnrolPanelState extends State<EnrolPanel> {
  final _code = TextEditingController();
  TwoFactorEnrolment? _enrolment;
  String? _loadError;
  String? _error;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _start();
  }

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  /// True when the error ended the sign-in (handed to [EnrolPanel.onChallengeEnded]).
  bool _ended(Object e) {
    if (widget.onChallengeEnded == null || !isTwoFactorChallengeExpired(e)) return false;
    widget.onChallengeEnded!(ApiService.errorMessage(e, fallback: 'This sign-in has expired. Please sign in again.'));
    return true;
  }

  Future<void> _start() async {
    setState(() {
      _loadError = null;
      _enrolment = null;
    });
    try {
      final e = await apiService.startTwoFactorEnrolment(challengeToken: widget.challengeToken);
      if (mounted) setState(() => _enrolment = e);
    } catch (e) {
      if (!mounted || _ended(e)) return;
      setState(() => _loadError = ApiService.errorMessage(e, fallback: 'Could not start setting up two-step sign-in'));
    }
  }

  Future<void> _openApp() async {
    final messenger = ScaffoldMessenger.of(context);
    var ok = false;
    try {
      ok = await launchUrl(Uri.parse(_enrolment!.otpauthUri), mode: LaunchMode.externalApplication);
    } catch (_) {}
    if (!ok) {
      messenger.showSnackBar(const SnackBar(
        content: Text('No authenticator app opened. Install one (Google Authenticator, Microsoft Authenticator, '
            'Authy or similar) or type the key into it.'),
      ));
    }
  }

  Future<void> _confirm() async {
    final problem = authenticatorCodeProblem(_code.text);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await apiService.confirmTwoFactorEnrolment(_code.text, challengeToken: widget.challengeToken);
      _code.clear();
      if (mounted) widget.onEnrolled(data);
    } catch (e) {
      if (!mounted || _ended(e)) return;
      // Wrong code (400), paused (429), changed key (409): the server's sentence; stay
      setState(() => _error = ApiService.errorMessage(e, fallback: 'That code is not right'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loadError != null) {
      return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        TwoFactorMessage(_loadError!),
        const SizedBox(height: 12),
        OutlinedButton(onPressed: _start, child: const Text('Try again')),
      ]);
    }
    final e = _enrolment;
    if (e == null) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 32),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    final muted = TextStyle(fontSize: 13.5, height: 1.4, color: AppTheme.muted(context));
    return Column(
      key: const Key('enrol-panel'),
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('1. Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or similar).',
            style: muted),
        const SizedBox(height: 4),
        Text('2. Add Dawabag to it: tap "Open authenticator app", or type the key below into the app.', style: muted),
        const SizedBox(height: 4),
        Text('3. Type the 6-digit code the app shows.', style: muted),
        const SizedBox(height: 14),
        if (e.otpauthUri.isNotEmpty) ...[
          OutlinedButton.icon(
            onPressed: _openApp,
            icon: const Icon(Icons.open_in_new, size: 18),
            label: const Text('Open authenticator app'),
          ),
          const SizedBox(height: 12),
        ],
        SecretKeyCard(enrolment: e),
        const SizedBox(height: 16),
        AuthenticatorCodeField(
          controller: _code,
          enabled: !_busy,
          label: 'Code from the app',
          onSubmitted: (_) => _confirm(),
        ),
        if (_error != null) ...[
          const SizedBox(height: 10),
          TwoFactorMessage(_error!),
        ],
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: _busy ? null : _confirm,
          child: _busy
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Switch on two-step sign-in'),
        ),
      ],
    );
  }
}
