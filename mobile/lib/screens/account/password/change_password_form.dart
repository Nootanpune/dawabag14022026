import 'package:flutter/material.dart';

import '../../../utils/password_policy.dart';

/// Sends the passwords; returns a plain error message, or null when changed.
typedef ChangePasswordSubmit = Future<String?> Function(String current, String next);

/// Current password, new password twice (as the web's ChangePasswordForm). The
/// rules are checked here first with the server's words; the server checks again.
/// Passwords stay in this form's memory only.
class ChangePasswordForm extends StatefulWidget {
  final String? mobile;
  /// Temporary password from Dawabag's admin: the label says so
  final bool temporary;
  final ChangePasswordSubmit onSubmit;
  const ChangePasswordForm({super.key, this.mobile, this.temporary = false, required this.onSubmit});

  @override
  State<ChangePasswordForm> createState() => _ChangePasswordFormState();
}

class _ChangePasswordFormState extends State<ChangePasswordForm> {
  final _current = TextEditingController();
  final _next = TextEditingController();
  final _again = TextEditingController();
  bool _show = false;
  bool _pending = false;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final problem = changePasswordProblem(
      current: _current.text,
      next: _next.text,
      again: _again.text,
      mobile: widget.mobile,
    );
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _error = null;
      _pending = true;
    });
    final error = await widget.onSubmit(_current.text, _next.text);
    if (!mounted) return;
    setState(() {
      _pending = false;
      _error = error;
    });
  }

  Widget _field(String label, TextEditingController c, {String? helper, List<String>? hints}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: TextField(
          controller: c,
          obscureText: !_show,
          autocorrect: false,
          enableSuggestions: false,
          autofillHints: hints,
          decoration: InputDecoration(labelText: label, helperText: helper, helperMaxLines: 2),
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _field(widget.temporary ? 'Current password (the temporary one you were given)' : 'Current password', _current,
            hints: const [AutofillHints.password]),
        _field('New password', _next, helper: kPasswordRules, hints: const [AutofillHints.newPassword]),
        _field('New password again', _again, hints: const [AutofillHints.newPassword]),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(
            onPressed: () => setState(() => _show = !_show),
            icon: Icon(_show ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 18),
            label: Text(_show ? 'Hide passwords' : 'Show passwords'),
          ),
        ),
        if (_error != null) ...[
          Semantics(
            liveRegion: true,
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                border: Border.all(color: Colors.red.shade200),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(_error!, style: TextStyle(fontSize: 13, color: Colors.red.shade900)),
            ),
          ),
          const SizedBox(height: 12),
        ],
        ElevatedButton(
          onPressed: _pending ? null : _submit,
          child: _pending
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Save new password'),
        ),
      ],
    );
  }
}
