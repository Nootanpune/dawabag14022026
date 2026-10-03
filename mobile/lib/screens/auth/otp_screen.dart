import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/otp_errors.dart';
import '../../services/password_reset_api.dart' show codeSentText;
import '../../services/registration_api.dart';
import '../../widgets/otp_input.dart';

/// Stand-alone OTP screen (sign-in with OTP, and login when the mobile is not
/// yet verified). The registration flow embeds its own OTP step. Sprint 36:
/// the server answers "code sent" for every mobile, so the wording is neutral.
class OTPScreen extends ConsumerStatefulWidget {
  final String mobile;
  const OTPScreen({super.key, required this.mobile});

  @override
  ConsumerState<OTPScreen> createState() => _OTPScreenState();
}

class _OTPScreenState extends ConsumerState<OTPScreen> {
  final _otpKey = GlobalKey<OtpInputState>();
  String _otp = '';
  bool _isLoading = false;
  bool _isResending = false;
  int _resendIn = 30;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _startResendTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  void _startResendTimer() {
    _timer?.cancel();
    _resendIn = 30; // callers rebuild (initState / setState in _resend)
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) {
        t.cancel();
        return;
      }
      if (_resendIn <= 1) {
        t.cancel();
        setState(() => _resendIn = 0);
      } else {
        setState(() => _resendIn--);
      }
    });
  }

  Future<void> _resend() async {
    setState(() => _isResending = true);
    try {
      await apiService.sendOtp(widget.mobile);
      if (!mounted) return;
      _startResendTimer();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(codeSentText(widget.mobile))),
      );
    } catch (e) {
      if (!mounted) return;
      if (isSmsNotConfigured(e)) {
        // Sprint 40: no code can arrive — back to password sign-in with the server's words
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(smsNotConfiguredMessage(e)), duration: const Duration(seconds: 8)),
        );
        context.go('/auth/login');
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(ApiService.errorMessage(e, fallback: 'Could not resend OTP')),
          backgroundColor: Colors.red,
        ),
      );
    } finally {
      if (mounted) setState(() => _isResending = false);
    }
  }

  Future<void> _verify() async {
    if (_otp.length != 6 || _isLoading) return;
    setState(() => _isLoading = true);
    final success = await ref.read(authProvider.notifier).verifyOTP(widget.mobile, _otp);
    if (!mounted) return;
    if (success) {
      context.go('/');
    } else {
      _otpKey.currentState?.clear();
      final error = ref.read(authProvider).error;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(error ?? 'Invalid OTP. Try again.'),
          backgroundColor: Colors.red,
        ),
      );
    }
    if (mounted) setState(() => _isLoading = false);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Verify mobile')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 16),
            const Text('Enter the 6-digit code',
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
            const SizedBox(height: 4),
            Text(codeSentText(widget.mobile),
              style: TextStyle(color: Colors.grey.shade600, fontSize: 15, height: 1.35)),
            const SizedBox(height: 36),

            OtpInput(
              key: _otpKey,
              enabled: !_isLoading,
              onChanged: (v) => setState(() => _otp = v),
              onCompleted: (_) => _verify(),
            ),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: (_resendIn > 0 || _isResending) ? null : _resend,
                child: Text(_resendIn > 0 ? 'Resend OTP in ${_resendIn}s' : 'Resend OTP'),
              ),
            ),
            const SizedBox(height: 20),

            ElevatedButton(
              onPressed: (_isLoading || _otp.length < 6) ? null : _verify,
              child: _isLoading
                  ? const SizedBox(width: 20, height: 20,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Verify'),
            ),
          ],
        ),
      ),
    );
  }
}
