import 'dart:async';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../services/api_service.dart';
import '../../../services/password_reset_api.dart';
import '../../../utils/password_policy.dart';
import '../../../widgets/brand/auth_page.dart';
import '../../../widgets/otp_input.dart';
import 'forgot_password_steps.dart';

enum ResetStep { mobile, otp, password, done, unavailable }

/// Forgot password (Sprint 35, owner's mock-up): OTP to the registered mobile
/// first, then the new password twice. The OTP, mobile and passwords live in
/// this screen's memory only and go to the server (C-41); the server checks
/// the OTP and the password rules and ends other sessions (C-44).
class ForgotPasswordScreen extends StatefulWidget {
  final String initialMobile;
  const ForgotPasswordScreen({super.key, this.initialMobile = ''});

  @override
  State<ForgotPasswordScreen> createState() => ForgotPasswordScreenState();
}

class ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _otpKey = GlobalKey<OtpInputState>();
  late final _mobile = TextEditingController(text: widget.initialMobile);
  final _next = TextEditingController();
  final _again = TextEditingController();
  ResetStep step = ResetStep.mobile;
  String _otp = '';
  bool _busy = false;
  bool _show = false;
  String? _error;
  int _resendIn = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    _mobile.dispose();
    _next.dispose();
    _again.dispose();
    super.dispose();
  }

  String get _mobileNumber => _mobile.text.trim();

  void _go(ResetStep s, {String? error}) => setState(() {
        // The OTP boxes start empty on the OTP step, so the OTP held here does too
        if (s == ResetStep.otp) _otp = '';
        step = s;
        _error = error;
      });

  void _startResendTimer() {
    _timer?.cancel();
    setState(() => _resendIn = 30);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted || _resendIn <= 1) {
        t.cancel();
        if (mounted) setState(() => _resendIn = 0);
        return;
      }
      setState(() => _resendIn--);
    });
  }

  Future<void> _sendOtp() async {
    if (step == ResetStep.mobile && !(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await apiService.sendPasswordResetOtp(_mobileNumber);
      if (!mounted) return;
      _startResendTimer();
      _go(ResetStep.otp);
    } catch (e) {
      if (mounted) setState(() => _error = ApiService.errorMessage(e, fallback: 'Could not send the OTP'));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _otpEntered() {
    if (_otp.length != 6) {
      setState(() => _error = 'Enter the 6-digit OTP');
      return;
    }
    _go(ResetStep.password);
  }

  Future<void> _save() async {
    final problem = resetPasswordProblem(next: _next.text, again: _again.text, mobile: _mobileNumber);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await apiService.resetPassword(mobile: _mobileNumber, otp: _otp, newPassword: _next.text);
      if (!mounted) return;
      _next.clear();
      _again.clear();
      _go(ResetStep.done);
    } on PasswordResetUnavailable {
      if (mounted) _go(ResetStep.unavailable);
    } catch (e) {
      if (!mounted) return;
      final message = ApiService.errorMessage(e, fallback: 'Could not change the password');
      // A wrong or expired OTP is fixed on the OTP step; anything else here
      if (message.contains('OTP')) {
        _go(ResetStep.otp, error: message);
      } else {
        setState(() => _error = message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _body() => switch (step) {
        ResetStep.mobile =>
          ResetMobileStep(mobile: _mobile, formKey: _formKey, onSend: _sendOtp, busy: _busy, error: _error),
        ResetStep.otp => ResetOtpStep(
            mobile: _mobileNumber,
            otpKey: _otpKey,
            onChanged: (v) => setState(() => _otp = v),
            onContinue: _otpEntered,
            onResend: (_resendIn > 0 || _busy) ? null : _sendOtp,
            resendIn: _resendIn,
            error: _error,
          ),
        ResetStep.password => ResetPasswordStep(
            next: _next,
            again: _again,
            show: _show,
            onToggleShow: () => setState(() => _show = !_show),
            onSubmit: _save,
            busy: _busy,
            error: _error,
          ),
        ResetStep.done => ResetMessage(
            icon: Icons.check_circle_outline,
            title: 'Password changed',
            text: 'Sign in with your mobile number and the new password.',
            action: 'Go to sign in',
            onAction: () => context.go('/auth/login'),
          ),
        // The server has no reset step yet: the OTP already sent still signs in
        ResetStep.unavailable => ResetMessage(
            icon: Icons.sms_outlined,
            title: 'Sign in with the OTP instead',
            text: 'Changing a forgotten password from the app is not switched on yet. '
                'You can still sign in with the OTP we sent to +91 $_mobileNumber.',
            action: 'Sign in with OTP',
            onAction: () => context.go('/auth/otp?mobile=$_mobileNumber'),
          ),
      };

  @override
  Widget build(BuildContext context) => PopScope(
        // Back steps through the flow before leaving it
        canPop: step == ResetStep.mobile || step == ResetStep.done || step == ResetStep.unavailable,
        onPopInvokedWithResult: (didPop, _) {
          if (didPop) return;
          _go(step == ResetStep.password ? ResetStep.otp : ResetStep.mobile);
        },
        child: AuthPage(showBack: true, logoWidth: 170, children: [_body()]),
      );
}
