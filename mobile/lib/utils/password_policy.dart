import 'dart:convert';

// Password rules shown in the app — a mirror of the server's
// backend/src/utils/passwordPolicy.ts (the server decides; this only gives
// early feedback, with the same words). C-44: reasonable security practices.

const kPasswordMin = 8;
const kPasswordMax = 72; // bcrypt reads only the first 72 bytes

const kPasswordRules = 'At least 8 characters, with a letter and a number. Not your mobile number.';

/// A plain reason the password is not acceptable, or null when it is.
String? passwordProblem(String password, {String? mobile}) {
  if (password.length < kPasswordMin) return 'Password must be at least $kPasswordMin characters';
  if (utf8.encode(password).length > kPasswordMax) return 'Password must be at most $kPasswordMax characters';
  if (!RegExp(r'[A-Za-z]').hasMatch(password) || !RegExp(r'\d').hasMatch(password)) {
    return 'Password must contain at least one letter and one number';
  }
  if (RegExp(r'^\s|\s$').hasMatch(password)) return 'Password cannot start or end with a space';
  if (mobile != null && mobile.isNotEmpty && password.contains(mobile)) {
    return 'Password cannot contain the mobile number';
  }
  return null;
}

/// Checks the whole form: current entered, new one valid, typed twice the
/// same, and different from the current one. Null when it can be sent.
String? changePasswordProblem({
  required String current,
  required String next,
  required String again,
  String? mobile,
}) {
  if (current.isEmpty) return 'Enter your current password';
  final p = passwordProblem(next, mobile: mobile);
  if (p != null) return p;
  if (next != again) return 'The two new passwords are not the same';
  if (next == current) return 'Choose a new password that is different from the current one';
  return null;
}

/// Forgot password (Sprint 35): the new password is valid and typed twice the
/// same. Null when it can be sent.
String? resetPasswordProblem({required String next, required String again, String? mobile}) {
  final p = passwordProblem(next, mobile: mobile);
  if (p != null) return p;
  if (next != again) return 'The two new passwords are not the same';
  return null;
}
