import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../widgets/two_factor/authenticator_code_field.dart';
import '../../../widgets/two_factor/two_factor_message.dart';

/// Asks for the password and a current code (authenticator or recovery code)
/// before switching two-step sign-in off or making new recovery codes
/// (Sprint 42). [onConfirm] calls the server and returns its error sentence,
/// or null on success (the dialog then closes with true). Both values stay in
/// this dialog's memory only.
class PasswordAndCodeDialog extends StatefulWidget {
  final String title;
  final String intro;
  final String confirmLabel;
  final bool danger;
  final Future<String?> Function(String password, String code) onConfirm;

  const PasswordAndCodeDialog({
    super.key,
    required this.title,
    required this.intro,
    required this.confirmLabel,
    required this.onConfirm,
    this.danger = false,
  });

  @override
  State<PasswordAndCodeDialog> createState() => _PasswordAndCodeDialogState();
}

class _PasswordAndCodeDialogState extends State<PasswordAndCodeDialog> {
  final _password = TextEditingController();
  final _code = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _code.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final code = _code.text.trim();
    String? problem;
    if (_password.text.isEmpty) {
      problem = 'Enter your password';
    } else if (authenticatorCodeProblem(code) != null && authenticatorCodeProblem(code, recovery: true) != null) {
      problem = 'Enter the 6-digit code from your authenticator app, or a recovery code';
    }
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.onConfirm(_password.text, code);
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop(true);
      return;
    }
    setState(() {
      _busy = false;
      _error = error;
    });
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: Text(widget.title),
        content: SingleChildScrollView(
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text(widget.intro, style: TextStyle(fontSize: 14, height: 1.4, color: AppTheme.muted(context))),
            const SizedBox(height: 14),
            TextField(
              key: const Key('two-factor-password'),
              controller: _password,
              obscureText: true,
              enabled: !_busy,
              autofillHints: const [AutofillHints.password],
              decoration: const InputDecoration(labelText: 'Password'),
            ),
            const SizedBox(height: 12),
            TextField(
              key: const Key('two-factor-dialog-code'),
              controller: _code,
              enabled: !_busy,
              autocorrect: false,
              enableSuggestions: false,
              maxLength: 11,
              decoration: const InputDecoration(
                labelText: 'Authenticator code or recovery code',
                hintText: '000000',
                counterText: '',
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              TwoFactorMessage(_error!),
            ],
          ]),
        ),
        actions: [
          TextButton(onPressed: _busy ? null : () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          TextButton(
            onPressed: _busy ? null : _submit,
            style: TextButton.styleFrom(foregroundColor: widget.danger ? const Color(0xFFB42318) : AppTheme.brandTeal),
            child: Text(widget.confirmLabel),
          ),
        ],
      );
}
