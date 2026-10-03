// Two-step sign-in for staff and partner logins (Sprint 42; backend
// services/twoFactor/*, C-41, C-43, C-46). Everything here is rebuilt from
// server answers and held in memory only — the challenge token, the set-up key
// and the recovery codes are never written to the device (owner rule: the
// server is the single source of truth; only the refresh token is kept, in the
// OS keychain).

import 'json_utils.dart';

/// What the server asks for after the first step (password, SMS code or
/// "Forgot password"): the authenticator code, or setting it up first.
enum TwoFactorStep { code, enrol }

/// `data: {two_factor, challenge_token, expires_in, methods}` from
/// /auth/login, /auth/verify-otp or /auth/reset-password — no tokens yet.
class TwoFactorChallenge {
  final TwoFactorStep step;

  /// Single use, a few minutes; memory only.
  final String challengeToken;
  final int expiresIn;
  final List<String> methods;

  /// The server's sentence that came with it ("Enter the 6-digit code…").
  final String? message;

  const TwoFactorChallenge({
    required this.step,
    required this.challengeToken,
    required this.expiresIn,
    this.methods = const [],
    this.message,
  });

  /// True when an auth answer's `data` is a challenge instead of a session.
  static bool isChallenge(Map<String, dynamic> data) =>
      (data['two_factor'] == 'code' || data['two_factor'] == 'enrol') && data['challenge_token'] is String;

  /// The challenge in [data], or null when [data] is a session.
  static TwoFactorChallenge? tryParse(Map<String, dynamic> data, {String? message}) {
    if (!isChallenge(data)) return null;
    return TwoFactorChallenge(
      step: data['two_factor'] == 'enrol' ? TwoFactorStep.enrol : TwoFactorStep.code,
      challengeToken: data['challenge_token'] as String,
      expiresIn: asInt(data['expires_in']),
      methods: (data['methods'] is List) ? (data['methods'] as List).map((e) => '$e').toList() : const [],
      message: message,
    );
  }

  @override
  String toString() => 'TwoFactorChallenge(${step.name})'; // never the token
}

/// POST /auth/2fa/enrol/start: a new key, shown once (QR drawn by the server,
/// the same key as text, and the otpauth:// link for an app on this phone).
class TwoFactorEnrolment {
  /// Base32 key in groups of four ("ABCD EFGH …").
  final String secret;
  final String otpauthUri;
  final String qrSvgDataUrl;
  final String issuer;
  final String account;

  const TwoFactorEnrolment({
    required this.secret,
    required this.otpauthUri,
    required this.qrSvgDataUrl,
    required this.issuer,
    required this.account,
  });

  factory TwoFactorEnrolment.fromJson(Map<String, dynamic> j) => TwoFactorEnrolment(
        secret: asString(j['secret']) ?? '',
        otpauthUri: asString(j['otpauth_uri']) ?? '',
        qrSvgDataUrl: asString(j['qr_svg_data_url']) ?? '',
        issuer: asString(j['issuer']) ?? 'Dawabag',
        account: asString(j['account']) ?? '',
      );

  /// The key's groups, for reading out and typing in by hand.
  List<String> get secretGroups => secret.split(RegExp(r'\s+')).where((g) => g.isNotEmpty).toList();
}

/// GET /auth/2fa/status — the login's own state; the server decides what is allowed.
class TwoFactorStatus {
  final bool applies;
  final String policy;
  final bool required;
  final bool enrolled;
  final String? confirmedAt;
  final int recoveryCodesLeft;
  final int recoveryCodesTotal;
  final bool mayDisable;
  final bool sessionTwoStep;

  const TwoFactorStatus({
    this.applies = false,
    this.policy = 'optional',
    this.required = false,
    this.enrolled = false,
    this.confirmedAt,
    this.recoveryCodesLeft = 0,
    this.recoveryCodesTotal = 10,
    this.mayDisable = false,
    this.sessionTwoStep = false,
  });

  factory TwoFactorStatus.fromJson(Map<String, dynamic> j) => TwoFactorStatus(
        applies: asBool(j['applies']),
        policy: asString(j['policy']) ?? 'optional',
        required: asBool(j['required']),
        enrolled: asBool(j['enrolled']),
        confirmedAt: asString(j['confirmed_at']),
        recoveryCodesLeft: asInt(j['recovery_codes_left']),
        recoveryCodesTotal: asInt(j['recovery_codes_total'], 10),
        mayDisable: asBool(j['may_disable']),
        sessionTwoStep: asBool(j['session_two_step']),
      );
}

/// Roles asked for the second step (mirror of backend policy.ts TWO_FACTOR_ROLES).
/// Only decides whether the account page shows the "Two-step sign-in" entry;
/// the server decides everything else.
const kTwoFactorRoles = {'super_admin', 'admin', 'pharmacist_rx', 'pharmacist_pack', 'partner'};

/// At or below this many unused recovery codes the app suggests making new ones.
const kLowRecoveryCodes = 3;

/// The warning after a sign-in with a recovery code, or with few left; null when fine.
String? recoveryCodesWarning({required String? secondStep, required int? left}) {
  if (left == null) return null;
  if (secondStep == 'recovery_code') {
    return 'Recovery code used. $left left — make new ones under Account › Two-step sign-in'
        '${left <= kLowRecoveryCodes ? ' soon' : ' if you are running low'}.';
  }
  if (left <= kLowRecoveryCodes) {
    return 'Only $left recovery code${left == 1 ? '' : 's'} left. Make new ones under Account › Two-step sign-in.';
  }
  return null;
}
