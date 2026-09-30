import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../widgets/otp_input.dart';

/// Stand-alone OTP screen (used from login when the mobile is not yet
/// verified). The registration flow embeds its own OTP step.
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
        SnackBar(content: Text('OTP sent to +91 ${widget.mobile}')),
      );
    } catch (e) {
      if (!mounted) return;
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
            Text('Enter the OTP sent to',
              style: TextStyle(color: Colors.grey.shade600, fontSize: 15)),
            const SizedBox(height: 4),
            Text('+91 ${widget.mobile}',
              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 18)),
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
