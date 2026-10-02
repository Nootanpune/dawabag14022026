import 'dart:async';

import '../../../services/api_service.dart';
import '../../../services/registration_api.dart';
import 'register_constants.dart';
import 'register_controller.dart';
import 'register_uploads.dart';

/// OTP step: resend timer, resend (POST /auth/send-otp) and verification.
extension RegisterOtp on RegisterController {
  void enterOtpStep() {
    final firstTime = resendTimer == null;
    goTo(RegisterStep.otp);
    if (firstTime) startResendTimer();
  }

  void startResendTimer() {
    resendTimer?.cancel();
    update(() => resendIn = 30);
    resendTimer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (isDisposed) {
        t.cancel();
        return;
      }
      if (resendIn <= 1) {
        t.cancel();
        update(() => resendIn = 0);
      } else {
        update(() => resendIn--);
      }
    });
  }

  Future<void> resendOtp() async {
    final mobile = registeredMobile;
    if (mobile == null) return;
    update(() => isResending = true);
    try {
      await apiService.sendOtp(mobile);
      if (isDisposed) return;
      startResendTimer();
      onMessage('OTP sent to +91 $mobile', false);
    } catch (e) {
      if (!isDisposed) {
        onMessage(ApiService.errorMessage(e, fallback: 'Could not resend OTP'), true);
      }
    } finally {
      update(() => isResending = false);
    }
  }

  void setOtp(String value) => update(() => otp = value);

  Future<void> submitOtp() async {
    final mobile = registeredMobile;
    if (mobile == null || otp.length != 6 || isVerifying) return;
    update(() {
      isVerifying = true;
      error = null;
    });
    try {
      final data = await verifyOtp(mobile, otp);
      if (isDisposed) return;
      resendTimer?.cancel();
      update(() => authData = data);

      if (isCustomer) {
        finish(message: 'Welcome to DAWA BAG!');
        return;
      }
      update(() {
        for (final type in files.keys) {
          uploadStatus[type] = UploadStatus.pending;
        }
      });
      await uploadAll();
    } catch (e) {
      if (isDisposed) return;
      otpKey.currentState?.clear();
      update(() => error = ApiService.errorMessage(e, fallback: 'Invalid OTP. Try again.'));
    } finally {
      update(() => isVerifying = false);
    }
  }
}
