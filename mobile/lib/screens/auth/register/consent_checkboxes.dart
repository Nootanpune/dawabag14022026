import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../config/theme.dart';
import 'register_constants.dart';
import 'register_controller.dart';
import 'register_widgets.dart';

/// Privacy notice + age (both required) and marketing (optional) consents,
/// sent as accept_privacy_notice / age_confirmed / marketing_consent.
class ConsentCheckboxes extends StatefulWidget {
  final RegisterController c;
  final void Function(String message, bool isError) onMessage;

  const ConsentCheckboxes({super.key, required this.c, required this.onMessage});

  @override
  State<ConsentCheckboxes> createState() => _ConsentCheckboxesState();
}

class _ConsentCheckboxesState extends State<ConsentCheckboxes> {
  late final TapGestureRecognizer _privacyTap = TapGestureRecognizer()
    ..onTap = _openPrivacyNotice;

  @override
  void dispose() {
    _privacyTap.dispose();
    super.dispose();
  }

  Future<void> _openPrivacyNotice() async {
    bool ok = false;
    try {
      ok = await launchUrl(
        Uri.parse(kPrivacyNoticeUrl),
        mode: LaunchMode.externalApplication,
      );
    } catch (_) {
      ok = false;
    }
    if (!ok && mounted) widget.onMessage('Could not open the Privacy Notice', true);
  }

  @override
  Widget build(BuildContext context) {
    final c = widget.c;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CheckboxFormField(
          value: c.acceptPrivacy,
          onChanged: (v) => c.update(() => c.acceptPrivacy = v),
          requiredMessage: 'Please accept the Privacy Notice to continue',
          title: Text.rich(
            TextSpan(
              style: const TextStyle(fontSize: 14),
              children: [
                const TextSpan(text: 'I have read the '),
                TextSpan(
                  text: 'Privacy Notice',
                  style: const TextStyle(
                    color: AppTheme.brandGreen,
                    fontWeight: FontWeight.w600,
                    decoration: TextDecoration.underline,
                  ),
                  recognizer: _privacyTap,
                ),
                const TextSpan(
                  text: ' and agree to Dawabag processing my personal and health data '
                      'to provide pharmacy services.',
                ),
              ],
            ),
          ),
        ),
        CheckboxFormField(
          value: c.ageConfirmed,
          onChanged: (v) => c.update(() => c.ageConfirmed = v),
          requiredMessage: 'You must be 18 or older to register',
          title: const Text('I confirm I am 18 years or older.', style: TextStyle(fontSize: 14)),
        ),
        CheckboxFormField(
          value: c.marketingConsent,
          onChanged: (v) => c.update(() => c.marketingConsent = v),
          title: const Text('Send me offers and health reminders by SMS/email (optional).',
              style: TextStyle(fontSize: 14)),
        ),
      ],
    );
  }
}
