import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../services/api_service.dart';
import '../../../services/two_factor_api.dart';
import '../../../widgets/two_factor/authenticator_code_field.dart';
import '../../../widgets/two_factor/two_factor_message.dart';

/// The second step at sign-in (Sprint 42; C-41, C-43): the 6-digit code from
/// the authenticator app — or, after "Use a recovery code", one of the
/// one-time recovery codes for a lost phone. POST /auth/2fa/verify.
class CodeStep extends StatefulWidget {
  final String challengeToken;

  /// The verify answer's `data` (the session is already stored by the API client).
  final ValueChanged<Map<String, dynamic>> onSignedIn;

  /// The challenge is gone on the server (expired or used): back to sign-in.
  final ValueChanged<String> onChallengeEnded;
  final VoidCallback onCancel;

  const CodeStep({
    super.key,
    required this.challengeToken,
    required this.onSignedIn,
    required this.onChallengeEnded,
    required this.onCancel,
  });

  @override
  State<CodeStep> createState() => _CodeStepState();
}

class _CodeStepState extends State<CodeStep> {
  final _code = TextEditingController();
  bool _recovery = false;
  bool _busy = false;

  /// Too many wrong codes (429): the server has ended this sign-in for a while.
  bool _paused = false;
  String? _error;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  void _toggle() => setState(() {
        _recovery = !_recovery;
        _code.clear();
        _error = null;
      });

  Future<void> _verify() async {
    final problem = authenticatorCodeProblem(_code.text, recovery: _recovery);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await apiService.verifySecondStep(widget.challengeToken, _code.text);
      _code.clear();
      if (mounted) widget.onSignedIn(data);
    } catch (e) {
      if (!mounted) return;
      if (isTwoFactorChallengeExpired(e)) {
        widget.onChallengeEnded(ApiService.errorMessage(e, fallback: 'This sign-in has expired. Please sign in again.'));
        return;
      }
      // 400 wrong code: stay; 429 paused: wait (the sentence says how long);
      // 409 key changed: use a recovery code — the server's words in each case
      setState(() {
        _paused = isTwoFactorPaused(e);
        _error = ApiService.errorMessage(e, fallback: 'That code is not right');
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
        key: const Key('two-factor-code-step'),
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            _recovery
                ? 'Enter one of your recovery codes. Each code works once.'
                : 'Enter the 6-digit code from your authenticator app.',
            style: TextStyle(fontSize: 14, height: 1.4, color: AppTheme.muted(context)),
          ),
          const SizedBox(height: 16),
          AuthenticatorCodeField(
            controller: _code,
            recovery: _recovery,
            enabled: !_busy && !_paused,
            onSubmitted: (_) => _verify(),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            TwoFactorMessage(_error!, icon: _paused ? Icons.hourglass_empty : null),
          ],
          const SizedBox(height: 16),
          ElevatedButton(
            onPressed: (_busy || _paused) ? null : _verify,
            child: _busy
                ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Verify and sign in'),
          ),
          const SizedBox(height: 4),
          TextButton(
            onPressed: (_busy || _paused) ? null : _toggle,
            child: Text(_recovery ? 'Use the authenticator code instead' : 'Use a recovery code'),
          ),
          TextButton(
            onPressed: _busy ? null : widget.onCancel,
            child: const Text('Cancel and sign in again'),
          ),
        ],
      );
}
