import 'password_gate.dart';

/// Where a fresh sign-in opens: the admin page, the doctor's portal, or the
/// shop — or first the change-password screen for a temporary password from
/// Dawabag's admin (Sprint 32). Shared by password, OTP and two-step sign-in.
String homeAfterSignIn(String? role, {bool mustChangePassword = false}) {
  final home = role == 'admin' || role == 'super_admin'
      ? '/admin'
      : role == 'doctor'
          ? '/doctor/portal'
          : '/';
  return mustChangePassword ? changePasswordLocation(required: true, next: home) : home;
}
