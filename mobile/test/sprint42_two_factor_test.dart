import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:dawabag/config/router.dart';
import 'package:dawabag/config/theme.dart';
import 'package:dawabag/models/two_factor.dart';
import 'package:dawabag/screens/account/two_factor/two_factor_settings_screen.dart';
import 'package:dawabag/screens/auth/forgot_password/forgot_password_screen.dart';
import 'package:dawabag/screens/auth/login_screen.dart';
import 'package:dawabag/screens/auth/two_factor/two_factor_screen.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/password_reset_api.dart';

// Sprint 42: two-step sign-in for staff and partner logins (backend
// controllers/twoFactor.controller.ts). The first step may answer with a
// challenge instead of tokens; the code (or a recovery code), or setting up an
// authenticator app, comes before any session. Only the refresh token is ever
// written to the device — never the challenge, the key or the recovery codes.

typedef _Answer = (int, Map<String, dynamic>);

/// A fake server: answers by "METHOD /path" (a queue per route, the last
/// answer repeats); records each request's path and JSON body.
class _Server implements HttpClientAdapter {
  final Map<String, List<_Answer>> routes;
  final calls = <(String, Map<String, dynamic>)>[];
  _Server(this.routes);

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    final key = '${options.method} ${options.path}';
    final data = options.data;
    calls.add((key, data is Map ? Map<String, dynamic>.from(data) : <String, dynamic>{}));
    final queue = routes[key];
    final (status, body) = (queue == null || queue.isEmpty)
        ? (404, <String, dynamic>{'success': false, 'message': 'Route $key not found'})
        : (queue.length > 1 ? queue.removeAt(0) : queue.first);
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  Iterable<Map<String, dynamic>> bodiesOf(String key) => calls.where((c) => c.$1 == key).map((c) => c.$2);

  @override
  void close({bool force = false}) {}
}

const _token = 'challenge-token-abcdefghijklmnopqrstuvwxyz';
const _recoveryCodes = [
  'abcde-fghjk', 'bcdef-ghjkm', 'cdefg-hjkmn', 'defgh-jkmnp', 'efghj-kmnpq',
  'fghjk-mnpqr', 'ghjkm-npqrs', 'hjkmn-pqrst', 'jkmnp-qrstu', 'kmnpq-rstuv',
];
const _secret = 'JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP';

_Answer _challenge(String step) => (
      200,
      {
        'success': true,
        'message': step == 'code'
            ? 'Enter the 6-digit code from your authenticator app'
            : 'Two-step sign-in is required for your login: set up an authenticator app to continue',
        'data': {
          'two_factor': step,
          'challenge_token': _token,
          'expires_in': step == 'code' ? 300 : 900,
          'methods': step == 'code' ? ['authenticator', 'recovery_code'] : ['authenticator'],
        },
      }
    );

Map<String, dynamic> _session({String role = 'partner', Map<String, dynamic> extra = const {}}) => {
      'user_id': 'u-1',
      'role': role,
      'customer_type': 'customer',
      'kyc_status': 'not_required',
      'mobile': '9876543210',
      'full_name': 'Asha Partner',
      'must_change_password': false,
      'access_token': 'access-1',
      'refresh_token': 'refresh-1',
      ...extra,
    };

_Answer _error(int status, String code, String message) =>
    (status, {'success': false, 'message': message, 'error': message, 'code': code});

const _wrong = 'That code is not right. Check the 6-digit code in your authenticator app (or a recovery code) and try again.';
const _expired = 'This sign-in has expired. Please sign in again.';
const _paused = 'Too many wrong codes. Please wait 15 minutes and try again.';

Widget _app() {
  final router = GoRouter(initialLocation: '/auth/login', routes: [
    GoRoute(path: '/', builder: (c, s) => const Scaffold(body: Text('Shop home'))),
    GoRoute(path: '/admin', builder: (c, s) => const Scaffold(body: Text('Admin home'))),
    GoRoute(path: '/auth/login', builder: (c, s) => const LoginScreen()),
    GoRoute(path: '/auth/otp', builder: (c, s) => const Scaffold(body: Text('OTP page'))),
    GoRoute(path: kTwoFactorPath, builder: (c, s) => const TwoFactorScreen()),
    GoRoute(
      path: '/auth/forgot-password',
      builder: (c, s) => ForgotPasswordScreen(initialMobile: s.uri.queryParameters['mobile'] ?? ''),
    ),
  ]);
  return ProviderScope(child: MaterialApp.router(theme: AppTheme.lightTheme(googleFonts: false), routerConfig: router));
}

Future<void> _phone(WidgetTester tester) async {
  tester.view.physicalSize = const Size(400 * 3, 900 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

Future<void> _signIn(WidgetTester tester) async {
  await tester.pumpWidget(_app());
  await tester.pumpAndSettle();
  await tester.enterText(find.byType(TextFormField).at(0), '9876543210');
  await tester.enterText(find.byType(TextFormField).at(1), 'Kmrt7392Hpwa');
  await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
  await tester.pumpAndSettle();
}

/// Scrolls [finder] into view, then taps it.
Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.pumpAndSettle();
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<Map<String, String>> _deviceStorage() => const FlutterSecureStorage().readAll();

/// Nothing but the refresh token on the device, and none of the second step's secrets in it.
Future<void> _expectOnlyRefreshToken({required bool signedIn}) async {
  final stored = await _deviceStorage();
  expect(stored.keys.toSet(), signedIn ? {'refresh_token'} : <String>{});
  final everything = stored.values.join(' ');
  expect(everything.contains(_token), isFalse);
  expect(everything.contains(_secret.replaceAll(' ', '')), isFalse);
  for (final c in _recoveryCodes) {
    expect(everything.contains(c), isFalse);
  }
}

void main() {
  late _Server server;

  setUp(() async {
    FlutterSecureStorage.setMockInitialValues({});
    await apiService.clearSession();
  });

  void serve(Map<String, List<_Answer>> routes) {
    server = _Server(routes);
    apiService.httpClientAdapter = server;
  }

  testWidgets('code path: a wrong code stays; the right one opens the session', (tester) async {
    await _phone(tester);
    serve({
      'POST /auth/login': [_challenge('code')],
      'POST /auth/2fa/verify': [
        _error(400, 'TWO_FACTOR_CODE_WRONG', _wrong),
        (200, {'success': true, 'data': _session(extra: {'second_step': 'authenticator', 'recovery_codes_left': 10})}),
      ],
    });
    await _signIn(tester);

    // No session yet: the code step, with nothing stored
    expect(find.byType(TwoFactorScreen), findsOneWidget);
    expect(find.text('Enter the 6-digit code from your authenticator app'), findsWidgets);
    await _expectOnlyRefreshToken(signedIn: false);
    expect(apiService.hasSession, isFalse);

    // Checked before sending
    await tester.enterText(find.byType(TextField), '12');
    await _tap(tester, find.widgetWithText(ElevatedButton, 'Verify and sign in'));
    expect(server.bodiesOf('POST /auth/2fa/verify'), isEmpty);

    await tester.enterText(find.byType(TextField), '111111');
    await _tap(tester, find.widgetWithText(ElevatedButton, 'Verify and sign in'));
    expect(find.text(_wrong), findsOneWidget);
    expect(find.byType(TwoFactorScreen), findsOneWidget);

    await tester.enterText(find.byType(TextField), '123456');
    await _tap(tester, find.widgetWithText(ElevatedButton, 'Verify and sign in'));
    expect(find.text('Shop home'), findsOneWidget);
    expect(server.bodiesOf('POST /auth/2fa/verify').last, {'challenge_token': _token, 'code': '123456'});
    expect(apiService.accessToken, 'access-1');
    expect(await _deviceStorage(), {'refresh_token': 'refresh-1'});
    // Ten codes left: no warning
    expect(find.textContaining('recovery code'), findsNothing);
  });

  testWidgets('recovery-code path: the toggle, the code sent, and the "running low" warning', (tester) async {
    await _phone(tester);
    serve({
      'POST /auth/login': [_challenge('code')],
      'POST /auth/2fa/verify': [
        (200, {'success': true, 'data': _session(role: 'admin', extra: {'second_step': 'recovery_code', 'recovery_codes_left': 2})}),
      ],
    });
    await _signIn(tester);
    await _tap(tester, find.text('Use a recovery code'));
    expect(find.text('Recovery code'), findsOneWidget);
    expect(find.text('Enter one of your recovery codes. Each code works once.'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'abc');
    await _tap(tester, find.widgetWithText(ElevatedButton, 'Verify and sign in'));
    expect(find.text('A recovery code looks like abcde-fghjk'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'abcde-fghjk');
    await _tap(tester, find.widgetWithText(ElevatedButton, 'Verify and sign in'));
    expect(server.bodiesOf('POST /auth/2fa/verify').single['code'], 'abcde-fghjk');
    expect(find.text('Admin home'), findsOneWidget); // an admin opens the admin page
    expect(find.textContaining('Recovery code used. 2 left'), findsOneWidget);
    await _expectOnlyRefreshToken(signedIn: true);
  });

  testWidgets('enrol path: set up, recovery codes shown once and never stored, then the app', (tester) async {
    await _phone(tester);
    serve({
      'POST /auth/login': [_challenge('enrol')],
      'POST /auth/2fa/enrol/start': [
        (200, {
          'success': true,
          'data': {
            'secret': _secret,
            'otpauth_uri': 'otpauth://totp/Dawabag:9876543210?secret=JBSWY3DPEHPK3PXP&issuer=Dawabag',
            'qr_svg_data_url': 'data:image/svg+xml;base64,PHN2Zy8+',
            'issuer': 'Dawabag',
            'account': '9876543210',
            'digits': 6,
            'period': 30,
          },
        }),
      ],
      'POST /auth/2fa/enrol/confirm': [
        _error(400, 'TWO_FACTOR_CODE_WRONG', _wrong),
        (200, {
          'success': true,
          'message': 'Two-step sign-in is on',
          'data': {'recovery_codes': _recoveryCodes, ..._session()},
        }),
      ],
    });
    await _signIn(tester);
    expect(find.text('Set up two-step sign-in'), findsOneWidget);
    expect(server.bodiesOf('POST /auth/2fa/enrol/start').single, {'challenge_token': _token});

    // The key in groups for typing in, and the authenticator link
    expect(find.text('JBSW'), findsNWidgets(2));
    expect(find.text('EHPK'), findsNWidgets(2));
    expect(find.text('Open authenticator app'), findsOneWidget);
    expect(find.text('Copy key'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '000000');
    await _tap(tester, find.widgetWithText(ElevatedButton, 'Switch on two-step sign-in'));
    expect(find.text(_wrong), findsOneWidget);

    await tester.enterText(find.byType(TextField), '654321');
    await _tap(tester, find.widgetWithText(ElevatedButton, 'Switch on two-step sign-in'));
    expect(server.bodiesOf('POST /auth/2fa/enrol/confirm').last, {'code': '654321', 'challenge_token': _token});

    // The ten codes, once; Continue only after "I have kept them"
    expect(find.byKey(const Key('recovery-codes')), findsOneWidget);
    for (final c in _recoveryCodes) {
      expect(find.text(c), findsOneWidget);
    }
    expect(find.text('Copy codes'), findsOneWidget);
    final cont = find.widgetWithText(ElevatedButton, 'Continue to Dawabag');
    expect(tester.widget<ElevatedButton>(cont).onPressed, isNull);
    // Not signed in on screen until they are kept (the router stays here)
    expect(find.text('Shop home'), findsNothing);
    await _expectOnlyRefreshToken(signedIn: true);

    await _tap(tester, find.byType(Checkbox));
    await _tap(tester, cont);
    expect(find.text('Shop home'), findsOneWidget);
    for (final c in _recoveryCodes) {
      expect(find.text(c), findsNothing);
    }
    expect(await _deviceStorage(), {'refresh_token': 'refresh-1'});
    await _expectOnlyRefreshToken(signedIn: true);
  });

  testWidgets('expired challenge: back to sign-in with the server\'s sentence', (tester) async {
    await _phone(tester);
    serve({
      'POST /auth/login': [_challenge('code')],
      'POST /auth/2fa/verify': [_error(401, 'TWO_FACTOR_CHALLENGE_EXPIRED', _expired)],
    });
    await _signIn(tester);
    await tester.enterText(find.byType(TextField), '123456');
    await _tap(tester, find.widgetWithText(ElevatedButton, 'Verify and sign in'));
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byType(TwoFactorScreen), findsNothing);
    expect(find.text(_expired), findsOneWidget);
    await _expectOnlyRefreshToken(signedIn: false);
  });

  testWidgets('too many wrong codes: the wait message, and no more tries', (tester) async {
    await _phone(tester);
    serve({
      'POST /auth/login': [_challenge('code')],
      'POST /auth/2fa/verify': [_error(429, 'TWO_FACTOR_PAUSED', _paused)],
    });
    await _signIn(tester);
    await tester.enterText(find.byType(TextField), '123456');
    await _tap(tester, find.widgetWithText(ElevatedButton, 'Verify and sign in'));
    expect(find.text(_paused), findsOneWidget);
    expect(tester.widget<ElevatedButton>(find.widgetWithText(ElevatedButton, 'Verify and sign in')).onPressed, isNull);
    await _tap(tester, find.text('Cancel and sign in again'));
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('changed server key (409): the server\'s sentence, stay', (tester) async {
    await _phone(tester);
    const keyChanged = 'Your authenticator cannot be checked on this server (its key changed). Use a recovery code, '
        'or ask a super admin to reset your two-step sign-in.';
    serve({
      'POST /auth/login': [_challenge('code')],
      'POST /auth/2fa/verify': [_error(409, 'TWO_FACTOR_KEY_CHANGED', keyChanged)],
    });
    await _signIn(tester);
    await tester.enterText(find.byType(TextField), '123456');
    await _tap(tester, find.widgetWithText(ElevatedButton, 'Verify and sign in'));
    expect(find.text(keyChanged), findsOneWidget);
    expect(find.byType(TwoFactorScreen), findsOneWidget);
  });

  testWidgets('a buyer\'s sign-in is unchanged: straight to the shop, no second step', (tester) async {
    await _phone(tester);
    serve({
      'POST /auth/login': [(200, {'success': true, 'data': _session(role: 'customer')})],
    });
    await _signIn(tester);
    expect(find.text('Shop home'), findsOneWidget);
    expect(server.calls.where((c) => c.$1.contains('/auth/2fa')), isEmpty);
    expect(await _deviceStorage(), {'refresh_token': 'refresh-1'});
  });

  test('"Forgot password" for a staff login answers with the challenge', () async {
    final ch = _challenge('code');
    serve({
      'POST /auth/reset-password': [
        (200, {...ch.$2, 'message': 'Password changed. Enter the 6-digit code from your authenticator app'}),
      ],
    });
    final challenge = await apiService.resetPassword(mobile: '9876543210', otp: '123456', newPassword: 'Kmrt7392Hpwa');
    expect(challenge?.step, TwoFactorStep.code);
    expect(challenge?.challengeToken, _token);
    expect(challenge?.message, 'Password changed. Enter the 6-digit code from your authenticator app');

    // A buyer's reset has no challenge: the "Password changed" page as before
    serve({'POST /auth/reset-password': [(200, {'success': true, 'message': 'Password changed', 'data': _session(role: 'customer')})]});
    expect(await apiService.resetPassword(mobile: '9876543210', otp: '123456', newPassword: 'Kmrt7392Hpwa'), isNull);
    expect(apiService.hasSession, isFalse);
  });

  testWidgets('refresh needing two-step sign-in: session cleared, sign-in with the message', (tester) async {
    await _phone(tester);
    FlutterSecureStorage.setMockInitialValues({'refresh_token': 'old-refresh'});
    const message = 'Please sign in again: this login now uses two-step sign-in';
    serve({
      'POST /auth/refresh': [_error(401, 'TWO_FACTOR_SIGN_IN_REQUIRED', message)],
    });
    await tester.pumpWidget(ProviderScope(
      child: Consumer(builder: (context, ref, _) => MaterialApp.router(
            theme: AppTheme.lightTheme(googleFonts: false),
            routerConfig: ref.watch(routerProvider),
          )),
    ));
    await tester.pumpAndSettle();
    expect(server.bodiesOf('POST /auth/refresh').single, {'refresh_token': 'old-refresh'});
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.text(message), findsOneWidget);
    expect(apiService.hasSession, isFalse);
    expect(await _deviceStorage(), isEmpty);
  });

  group('account: Two-step sign-in', () {
    Widget settings() => MaterialApp(
          theme: AppTheme.lightTheme(googleFonts: false),
          home: const TwoFactorSettingsScreen(),
        );

    Map<String, dynamic> status({bool mayDisable = false, bool required = true, int left = 3}) => {
          'applies': true,
          'policy': required ? 'required' : 'optional',
          'required': required,
          'enrolled': true,
          'confirmed_at': '2026-09-01T10:00:00Z',
          'recovery_codes_left': left,
          'recovery_codes_total': 10,
          'may_disable': mayDisable,
          'session_two_step': true,
        };

    testWidgets('status; new recovery codes need the password and a code; no switch-off when required', (tester) async {
      await _phone(tester);
      serve({
        'GET /auth/2fa/status': [(200, {'success': true, 'data': status()})],
        'POST /auth/2fa/recovery-codes': [
          _error(400, 'PASSWORD_WRONG', 'Your password is not right'),
          (200, {'success': true, 'data': {'recovery_codes': _recoveryCodes}}),
        ],
      });
      await tester.pumpWidget(settings());
      await tester.pumpAndSettle();
      expect(find.text('Two-step sign-in is on'), findsOneWidget);
      expect(find.text('Recovery codes left: 3 of 10.'), findsOneWidget);
      expect(find.text('It is required for your login and cannot be switched off.'), findsOneWidget);
      expect(find.text('Switch off'), findsNothing);

      await _tap(tester, find.text('New recovery codes'));
      await tester.enterText(find.byKey(const Key('two-factor-password')), 'wrong');
      await tester.enterText(find.byKey(const Key('two-factor-dialog-code')), '123456');
      await tester.tap(find.text('Make new codes'));
      await tester.pumpAndSettle();
      expect(find.text('Your password is not right'), findsOneWidget);

      await tester.enterText(find.byKey(const Key('two-factor-password')), 'Kmrt7392Hpwa');
      await tester.tap(find.text('Make new codes'));
      await tester.pumpAndSettle();
      expect(server.bodiesOf('POST /auth/2fa/recovery-codes').last, {'password': 'Kmrt7392Hpwa', 'code': '123456'});
      expect(find.text(_recoveryCodes.first), findsOneWidget);
      await _tap(tester, find.byType(Checkbox));
      await _tap(tester, find.widgetWithText(ElevatedButton, 'Done'));
      expect(find.text(_recoveryCodes.first), findsNothing);
      await _expectOnlyRefreshToken(signedIn: false);
    });

    testWidgets('switch off where the policy allows; the server\'s sentence', (tester) async {
      await _phone(tester);
      serve({
        'GET /auth/2fa/status': [
          (200, {'success': true, 'data': status(mayDisable: true, required: false, left: 9)}),
          (200, {'success': true, 'data': {...status(required: false), 'enrolled': false, 'recovery_codes_left': 0}}),
        ],
        'POST /auth/2fa/disable': [(200, {'success': true, 'message': 'Two-step sign-in is off'})],
      });
      await tester.pumpWidget(settings());
      await tester.pumpAndSettle();
      await _tap(tester, find.widgetWithText(OutlinedButton, 'Switch off'));
      await tester.enterText(find.byKey(const Key('two-factor-password')), 'Kmrt7392Hpwa');
      await tester.enterText(find.byKey(const Key('two-factor-dialog-code')), '123456');
      await tester.tap(find.widgetWithText(TextButton, 'Switch off'));
      await tester.pumpAndSettle();
      expect(server.bodiesOf('POST /auth/2fa/disable').single, {'password': 'Kmrt7392Hpwa', 'code': '123456'});
      expect(find.text('Two-step sign-in is off'), findsWidgets);
      expect(find.text('Set up an authenticator app'), findsOneWidget);
    });
  });

  test('the low recovery codes warning', () {
    expect(recoveryCodesWarning(secondStep: 'authenticator', left: 10), isNull);
    expect(recoveryCodesWarning(secondStep: 'authenticator', left: 2), contains('Only 2 recovery codes left'));
    expect(recoveryCodesWarning(secondStep: 'recovery_code', left: 7), startsWith('Recovery code used. 7 left'));
  });
}
