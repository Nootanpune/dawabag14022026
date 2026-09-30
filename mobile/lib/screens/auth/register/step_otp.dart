import 'package:flutter/material.dart';

import '../../../widgets/otp_input.dart';
import 'register_controller.dart';
import 'register_otp.dart';
import 'register_widgets.dart';

/// Step 4a — 6-digit OTP with resend.
class StepOtp extends StatelessWidget {
  final RegisterController c;
  const StepOtp({super.key, required this.c});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const SizedBox(height: 8),
        Text('Enter the 6-digit OTP sent to',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 15)),
        const SizedBox(height: 4),
        Text('+91 ${c.registeredMobile ?? ''}',
            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
        const SizedBox(height: 28),
        OtpInput(
          key: c.otpKey,
          enabled: !c.isVerifying,
          onChanged: c.setOtp,
          onCompleted: (_) => c.submitOtp(),
        ),
        const SizedBox(height: 12),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: (c.resendIn > 0 || c.isResending || c.isVerifying) ? null : c.resendOtp,
            child: Text(c.resendIn > 0 ? 'Resend OTP in ${c.resendIn}s' : 'Resend OTP'),
          ),
        ),
        if (!c.isCustomer) ...[
          const SizedBox(height: 4),
          Text(
            'After verification your ${c.files.length} document(s) will be uploaded.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 13),
          ),
        ],
        const SizedBox(height: 20),
        RegisterErrorBanner(error: c.error),
        RegisterPrimaryButton(
          'Verify',
          c.otp.length == 6 ? c.submitOtp : null,
          loading: c.isVerifying,
        ),
      ],
    );
  }
}
