import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/sign_in_home.dart';
import '../../../config/theme.dart';
import '../../../models/two_factor.dart';
import '../../../providers/auth_provider.dart';
import '../../../services/two_factor_api.dart';
import '../../../widgets/brand/auth_page.dart';
import '../../../widgets/two_factor/enrol_panel.dart';
import '../../../widgets/two_factor/recovery_codes_view.dart';
import 'code_step.dart';

const kTwoFactorPath = '/auth/two-factor';

/// The second step of a staff or partner sign-in (Sprint 42; C-41, C-43, C-46),
/// after the password (/auth/login), the SMS code (/auth/verify-otp) or
/// "Forgot password" (/auth/reset-password) answered with a challenge instead
/// of tokens. 'code': the authenticator code or a recovery code. 'enrol':
/// two-step sign-in is required and not set up yet — set it up, write down the
/// recovery codes, then continue. The session is published only at the end.
///
/// The challenge token lives in [AuthState.challenge] (memory only); the
/// recovery codes live in this screen's state until "Continue" and are then
/// dropped — nothing of either is written to the device.
class TwoFactorScreen extends ConsumerStatefulWidget {
  const TwoFactorScreen({super.key});

  @override
  ConsumerState<TwoFactorScreen> createState() => _TwoFactorScreenState();
}

class _TwoFactorScreenState extends ConsumerState<TwoFactorScreen> {
  /// After enrolment: shown once, then forgotten.
  List<String>? _codes;

  /// The two-step session from the enrolment, published after the codes are kept.
  Map<String, dynamic>? _session;

  AuthNotifier get _auth => ref.read(authProvider.notifier);

  void _finish(Map<String, dynamic> data, {String? warning}) {
    final messenger = ScaffoldMessenger.of(context);
    _auth.completeSignIn(data);
    final auth = ref.read(authProvider);
    context.go(homeAfterSignIn(auth.user?['role'] as String?, mustChangePassword: auth.mustChangePassword));
    if (warning != null) {
      messenger.showSnackBar(SnackBar(
        content: Text(warning),
        duration: const Duration(seconds: 10),
        backgroundColor: AppTheme.amberText,
      ));
    }
  }

  void _codeAccepted(Map<String, dynamic> data) => _finish(
        data,
        warning: recoveryCodesWarning(
          secondStep: data['second_step'] as String?,
          left: data['recovery_codes_left'] is num ? (data['recovery_codes_left'] as num).toInt() : null,
        ),
      );

  void _enrolled(Map<String, dynamic> data) => setState(() {
        _codes = recoveryCodesOf(data);
        _session = Map<String, dynamic>.from(data)..remove('recovery_codes');
      });

  void _codesKept() {
    final session = _session!;
    setState(() {
      _codes = null;
      _session = null;
    });
    _finish(session);
  }

  void _ended(String message) {
    _auth.challengeEnded(message);
    context.go('/auth/login');
  }

  void _cancel() {
    _auth.cancelSecondStep();
    context.go('/auth/login');
  }

  @override
  Widget build(BuildContext context) {
    final challenge = ref.watch(authProvider.select((s) => s.challenge));
    final showingCodes = _codes != null;
    return PopScope(
      // The recovery codes are kept (or not) before leaving. (Back otherwise just
      // returns to sign-in; a left-over challenge is replaced by the next sign-in
      // and expires on the server within minutes.)
      canPop: !showingCodes,
      child: AuthPage(logoWidth: 150, children: [
        if (showingCodes)
          RecoveryCodesView(codes: _codes!, onDone: _codesKept, doneLabel: 'Continue to Dawabag')
        else if (challenge == null)
          _NoChallenge(onSignIn: () => context.go('/auth/login'))
        else ...[
          _Header(challenge: challenge),
          const SizedBox(height: 20),
          if (challenge.step == TwoFactorStep.code)
            CodeStep(
              challengeToken: challenge.challengeToken,
              onSignedIn: _codeAccepted,
              onChallengeEnded: _ended,
              onCancel: _cancel,
            )
          else ...[
            EnrolPanel(challengeToken: challenge.challengeToken, onEnrolled: _enrolled, onChallengeEnded: _ended),
            const SizedBox(height: 8),
            TextButton(onPressed: _cancel, child: const Text('Cancel and sign in again')),
          ],
        ],
      ]),
    );
  }
}

class _Header extends StatelessWidget {
  final TwoFactorChallenge challenge;
  const _Header({required this.challenge});

  @override
  Widget build(BuildContext context) {
    final enrol = challenge.step == TwoFactorStep.enrol;
    final text = challenge.message ??
        (enrol
            ? 'Two-step sign-in is required for your login. Set up an authenticator app to continue.'
            : 'Two-step sign-in is on for this login.');
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      Text(enrol ? 'Set up two-step sign-in' : 'Two-step sign-in',
          style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
      const SizedBox(height: 10),
      Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(color: AppTheme.brandTeal50, borderRadius: BorderRadius.circular(10)),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Icon(Icons.verified_user_outlined, size: 20, color: AppTheme.brandTeal700),
          const SizedBox(width: 10),
          Expanded(child: Text(text, style: const TextStyle(fontSize: 13.5, height: 1.35, color: AppTheme.brandTeal700))),
        ]),
      ),
    ]);
  }
}

class _NoChallenge extends StatelessWidget {
  final VoidCallback onSignIn;
  const _NoChallenge({required this.onSignIn});

  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('This sign-in is no longer open. Please sign in again.', textAlign: TextAlign.center),
        const SizedBox(height: 16),
        ElevatedButton(onPressed: onSignIn, child: const Text('Go to sign in')),
      ]);
}
