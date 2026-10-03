import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/two_factor.dart';
import '../../../services/api_service.dart';
import '../../../services/two_factor_api.dart';
import '../../../utils/ist.dart';
import '../../../widgets/error_retry_view.dart';
import '../../../widgets/two_factor/enrol_panel.dart';
import '../../../widgets/two_factor/recovery_codes_view.dart';
import 'password_and_code_dialog.dart';

const kTwoFactorSettingsPath = '/account/two-factor';

/// A staff or partner login's own two-step sign-in (Sprint 42; C-41, C-43,
/// C-46): its state from GET /auth/2fa/status, set it up, make new recovery
/// codes, or switch it off where the server's policy allows (the server
/// decides and its sentence is shown). Nothing is kept on the device.
class TwoFactorSettingsScreen extends StatefulWidget {
  const TwoFactorSettingsScreen({super.key});

  @override
  State<TwoFactorSettingsScreen> createState() => _TwoFactorSettingsScreenState();
}

class _TwoFactorSettingsScreenState extends State<TwoFactorSettingsScreen> {
  TwoFactorStatus? _status;
  String? _loadError;
  bool _enrolling = false;

  /// New recovery codes, shown once and then dropped.
  List<String>? _codes;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loadError = null);
    try {
      final s = await apiService.fetchTwoFactorStatus();
      if (mounted) setState(() => _status = s);
    } catch (e) {
      if (mounted) setState(() => _loadError = ApiService.errorMessage(e, fallback: 'Could not load two-step sign-in'));
    }
  }

  void _snack(String text) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(text)));

  void _enrolled(Map<String, dynamic> data) {
    // The API client already uses the new two-step session the server opened
    setState(() {
      _enrolling = false;
      _codes = recoveryCodesOf(data);
    });
    _snack('Two-step sign-in is on');
    _load();
  }

  Future<void> _renewCodes() async {
    List<String>? fresh;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => PasswordAndCodeDialog(
        title: 'New recovery codes',
        intro: 'Ten new codes replace the old ones, which stop working at once.',
        confirmLabel: 'Make new codes',
        onConfirm: (password, code) async {
          try {
            fresh = await apiService.renewRecoveryCodes(password, code);
            return null;
          } catch (e) {
            return ApiService.errorMessage(e, fallback: 'That did not work');
          }
        },
      ),
    );
    if (ok == true && mounted && fresh != null) setState(() => _codes = fresh);
  }

  Future<void> _disable() async {
    String? message;
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => PasswordAndCodeDialog(
        title: 'Switch off two-step sign-in',
        intro: 'Your sign-in will need only your password again.',
        confirmLabel: 'Switch off',
        danger: true,
        onConfirm: (password, code) async {
          try {
            message = await apiService.disableTwoFactor(password, code);
            return null;
          } catch (e) {
            // e.g. 409 TWO_FACTOR_REQUIRED: the server's sentence
            return ApiService.errorMessage(e, fallback: 'That did not work');
          }
        },
      ),
    );
    if (ok == true && mounted) {
      _snack(message ?? 'Two-step sign-in is off');
      _load();
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('Two-step sign-in')),
        body: _body(),
      );

  Widget _body() {
    if (_loadError != null && _status == null) return ErrorRetryView(message: _loadError!, onRetry: _load);
    final s = _status;
    if (s == null) return const Center(child: CircularProgressIndicator());
    final muted = TextStyle(fontSize: 14, height: 1.4, color: AppTheme.muted(context));
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text('Your password plus a code from an authenticator app on your phone.', style: muted),
      const SizedBox(height: 16),
      if (!s.applies)
        Text('Two-step sign-in is for Dawabag staff and partner logins.', style: muted)
      else if (_codes != null)
        RecoveryCodesView(codes: _codes!, doneLabel: 'Done', onDone: () => setState(() => _codes = null))
      else if (_enrolling) ...[
        EnrolPanel(onEnrolled: _enrolled),
        const SizedBox(height: 8),
        TextButton(onPressed: () => setState(() => _enrolling = false), child: const Text('Cancel')),
      ] else if (s.enrolled)
        _OnCard(status: s, onRenew: _renewCodes, onDisable: s.mayDisable ? _disable : null)
      else
        _OffCard(status: s, onSetUp: () => setState(() => _enrolling = true)),
    ]);
  }
}

class _OnCard extends StatelessWidget {
  final TwoFactorStatus status;
  final VoidCallback onRenew;
  final VoidCallback? onDisable;
  const _OnCard({required this.status, required this.onRenew, this.onDisable});

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(fontSize: 14, height: 1.4, color: AppTheme.muted(context));
    final low = status.recoveryCodesLeft <= kLowRecoveryCodes;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.verified_user, color: AppTheme.brandTeal, size: 28),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Two-step sign-in is on',
                key: Key('two-factor-state'), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            if (status.confirmedAt != null) Text('Since ${formatDateTimeIst(status.confirmedAt)}.', style: muted),
            Text('Recovery codes left: ${status.recoveryCodesLeft} of ${status.recoveryCodesTotal}.',
                style: low ? muted.copyWith(color: AppTheme.amberText, fontWeight: FontWeight.w600) : muted),
            if (status.required) Text('It is required for your login and cannot be switched off.', style: muted),
          ]),
        ),
      ]),
      const SizedBox(height: 20),
      ElevatedButton(onPressed: onRenew, child: const Text('New recovery codes')),
      if (onDisable != null) ...[
        const SizedBox(height: 10),
        OutlinedButton(
          onPressed: onDisable,
          style: OutlinedButton.styleFrom(
            foregroundColor: const Color(0xFFB42318),
            side: const BorderSide(color: Color(0xFFF2B8B5)),
          ),
          child: const Text('Switch off'),
        ),
      ],
    ]);
  }
}

class _OffCard extends StatelessWidget {
  final TwoFactorStatus status;
  final VoidCallback onSetUp;
  const _OffCard({required this.status, required this.onSetUp});

  @override
  Widget build(BuildContext context) {
    final muted = TextStyle(fontSize: 14, height: 1.4, color: AppTheme.muted(context));
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Icon(Icons.shield_outlined, color: AppTheme.amberText, size: 28),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Two-step sign-in is off',
                key: Key('two-factor-state'), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(
              'With it on, a stolen password — or a text-message code from a swapped SIM — is not enough to sign in as you.'
              '${status.required ? ' It is required for your login: you will be asked to set it up at your next sign-in.' : ''}',
              style: muted,
            ),
          ]),
        ),
      ]),
      const SizedBox(height: 20),
      ElevatedButton(onPressed: onSetUp, child: const Text('Set up an authenticator app')),
    ]);
  }
}
