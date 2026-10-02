import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../config/theme.dart';
import '../../../utils/mobile_number.dart';
import '../../../utils/password_policy.dart';
import '../../../widgets/brand/labeled_field.dart';
import '../../../widgets/otp_input.dart';

/// Step titles and a plain sentence under them.
class ResetHeading extends StatelessWidget {
  final String title;
  final String text;
  const ResetHeading({super.key, required this.title, required this.text});

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 6),
          Text(text, style: TextStyle(fontSize: 14, height: 1.4, color: AppTheme.muted(context))),
          const SizedBox(height: 20),
        ],
      );
}

/// A red sentence under the fields (null shows nothing).
class ResetError extends StatelessWidget {
  final String? message;
  const ResetError(this.message, {super.key});

  @override
  Widget build(BuildContext context) {
    final m = message;
    if (m == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 12),
      child: Text(m, style: const TextStyle(color: AppTheme.errorRed, fontSize: 13.5)),
    );
  }
}

/// Pill button with a spinner while busy.
class ResetButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  const ResetButton(this.label, this.onPressed, {super.key, this.busy = false});

  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: busy ? null : onPressed,
        child: busy
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
            : Text(label),
      );
}

/// Step 1: the registered mobile number.
class ResetMobileStep extends StatelessWidget {
  final TextEditingController mobile;
  final GlobalKey<FormState> formKey;
  final VoidCallback onSend;
  final bool busy;
  final String? error;
  const ResetMobileStep(
      {super.key, required this.mobile, required this.formKey, required this.onSend, required this.busy, this.error});

  @override
  Widget build(BuildContext context) => Form(
        key: formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const ResetHeading(
              title: 'Forgot password',
              text: 'We will send a 6-digit OTP to your registered mobile number. '
                  'After that you choose a new password.',
            ),
            LabeledField(
              label: 'Mobile number',
              child: TextFormField(
                controller: mobile,
                keyboardType: TextInputType.phone,
                maxLength: 10,
                autofillHints: const [AutofillHints.telephoneNumberNational],
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                decoration: const InputDecoration(
                  hintText: '9876543210',
                  prefixText: '+91  ',
                  counterText: '',
                  suffixIcon: Icon(Icons.smartphone_outlined),
                ),
                validator: mobileProblem,
              ),
            ),
            const SizedBox(height: 16),
            ResetError(error),
            ResetButton('Send OTP', onSend, busy: busy),
          ],
        ),
      );
}

/// Step 2: the OTP. It is checked by the server with the new password.
class ResetOtpStep extends StatelessWidget {
  final String mobile;
  final GlobalKey<OtpInputState> otpKey;
  final ValueChanged<String> onChanged;
  final VoidCallback? onContinue;
  final VoidCallback? onResend;
  final int resendIn;
  final String? error;
  const ResetOtpStep(
      {super.key,
      required this.mobile,
      required this.otpKey,
      required this.onChanged,
      required this.onContinue,
      required this.onResend,
      required this.resendIn,
      this.error});

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ResetHeading(title: 'Enter the OTP', text: 'We sent a 6-digit OTP to +91 $mobile.'),
          OtpInput(key: otpKey, onChanged: onChanged),
          Align(
            alignment: Alignment.centerRight,
            child: TextButton(
              onPressed: onResend,
              child: Text(resendIn > 0 ? 'Resend OTP in ${resendIn}s' : 'Resend OTP'),
            ),
          ),
          ResetError(error),
          ResetButton('Continue', onContinue),
        ],
      );
}

/// Step 3: the new password, twice (as the owner's mock-up).
class ResetPasswordStep extends StatelessWidget {
  final TextEditingController next;
  final TextEditingController again;
  final bool show;
  final VoidCallback onToggleShow;
  final VoidCallback onSubmit;
  final bool busy;
  final String? error;
  const ResetPasswordStep(
      {super.key,
      required this.next,
      required this.again,
      required this.show,
      required this.onToggleShow,
      required this.onSubmit,
      required this.busy,
      this.error});

  Widget _field(String label, TextEditingController c, {String? helper, Widget? suffix}) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: LabeledField(
          label: label,
          child: TextField(
            controller: c,
            obscureText: !show,
            autocorrect: false,
            enableSuggestions: false,
            autofillHints: const [AutofillHints.newPassword],
            decoration: InputDecoration(helperText: helper, helperMaxLines: 2, suffixIcon: suffix),
          ),
        ),
      );

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ResetHeading(
              title: 'Choose a new password', text: 'Every other device signed in to your account will be signed out.'),
          _field('New password', next,
              helper: kPasswordRules,
              suffix: IconButton(
                tooltip: show ? 'Hide passwords' : 'Show passwords',
                icon: Icon(show ? Icons.visibility_off : Icons.visibility, size: 20),
                onPressed: onToggleShow,
              )),
          _field('Confirm new password', again),
          ResetError(error),
          ResetButton('Save new password', onSubmit, busy: busy),
        ],
      );
}

/// Final message with one action.
class ResetMessage extends StatelessWidget {
  final IconData icon;
  final String title;
  final String text;
  final String action;
  final VoidCallback onAction;
  const ResetMessage(
      {super.key,
      required this.icon,
      required this.title,
      required this.text,
      required this.action,
      required this.onAction});

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Icon(icon, size: 48, color: AppTheme.brandTeal),
          const SizedBox(height: 12),
          Text(title,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Text(text,
              textAlign: TextAlign.center, style: TextStyle(fontSize: 14, height: 1.4, color: AppTheme.muted(context))),
          const SizedBox(height: 24),
          ElevatedButton(onPressed: onAction, child: Text(action)),
        ],
      );
}
