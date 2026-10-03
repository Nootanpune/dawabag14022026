import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../brand/labeled_field.dart';

/// Checks a code before it is sent: 6 digits, or a recovery code
/// (`abcde-fghjk`, ten letters/digits). Null when it looks right.
String? authenticatorCodeProblem(String value, {bool recovery = false}) {
  final v = value.trim();
  if (recovery) {
    return v.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '').length == 10 ? null : 'A recovery code looks like abcde-fghjk';
  }
  return RegExp(r'^\d{6}$').hasMatch(v) ? null : 'Enter the 6-digit code from your authenticator app';
}

/// The field for the authenticator's 6-digit code — or, with [recovery], a
/// recovery code (Sprint 42). What is typed stays in the form's memory only.
class AuthenticatorCodeField extends StatelessWidget {
  final TextEditingController controller;
  final bool recovery;
  final bool enabled;
  final String? label;
  final ValueChanged<String>? onSubmitted;
  const AuthenticatorCodeField({
    super.key,
    required this.controller,
    this.recovery = false,
    this.enabled = true,
    this.label,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) => LabeledField(
        label: label ?? (recovery ? 'Recovery code' : 'Authenticator code'),
        child: TextField(
          key: ValueKey(recovery ? 'recovery-code' : 'totp-code'),
          controller: controller,
          enabled: enabled,
          autofocus: true,
          autocorrect: false,
          enableSuggestions: false,
          keyboardType: recovery ? TextInputType.visiblePassword : TextInputType.number,
          maxLength: recovery ? 11 : 6,
          autofillHints: recovery ? null : const [AutofillHints.oneTimeCode],
          inputFormatters: recovery
              ? [FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9-]'))]
              : [FilteringTextInputFormatter.digitsOnly],
          textInputAction: TextInputAction.done,
          onSubmitted: onSubmitted,
          style: TextStyle(fontFamily: 'monospace', fontSize: 18, letterSpacing: recovery ? 2 : 6),
          decoration: InputDecoration(
            hintText: recovery ? 'abcde-fghjk' : '000000',
            counterText: '',
            suffixIcon: Icon(recovery ? Icons.key_outlined : Icons.pin_outlined),
          ),
        ),
      );
}
