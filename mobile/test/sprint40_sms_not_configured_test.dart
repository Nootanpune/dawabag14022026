import 'dart:convert';
import 'dart:typed_data';

import 'package:dawabag/config/theme.dart';
import 'package:dawabag/screens/auth/forgot_password/forgot_password_screen.dart';
import 'package:dawabag/screens/auth/login_screen.dart';
import 'package:dawabag/screens/auth/otp_screen.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/otp_errors.dart';
import 'package:dawabag/utils/notification_kinds.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

// Sprint 40 (app): with no text-message provider switched on, POST
// /auth/send-otp answers 503 SMS_NOT_CONFIGURED — the same for every mobile
// (C-41 / C-44). The app shows the server's sentence and keeps the person on
// the password path instead of a code step. Also the new staff-only alerts.

const _smsOffMsg =
    'Text-message codes are not switched on yet. Please sign in with your password, or ask the admin to reset it.';
const _smsOff = {'success': false, 'code': 'SMS_NOT_CONFIGURED', 'message': _smsOffMsg, 'error': _smsOffMsg};
const _sent = {
  'success': true,
  'message': 'If this mobile number has an account, a code has been sent to it',
  'data': {'otp_sent': true},
};

class _Api implements HttpClientAdapter {
  final Map<String, (int, Map<String, dynamic>)> answers;
  final calls = <String>[];
  _Api(this.answers);

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? s, Future<void>? c) async {
    calls.add(o.path);
    final (status, body) = answers[o.path] ?? (500, {'success': false, 'message': 'unexpected ${o.path}'});
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

Widget _app(String initial) {
  final router = GoRouter(initialLocation: initial, routes: [
    GoRoute(path: '/auth/login', builder: (c, s) => const LoginScreen()),
    GoRoute(path: '/auth/otp', builder: (c, s) => OTPScreen(mobile: s.uri.queryParameters['mobile'] ?? '')),
    GoRoute(
      path: '/auth/forgot-password',
      builder: (c, s) => ForgotPasswordScreen(initialMobile: s.uri.queryParameters['mobile'] ?? ''),
    ),
  ]);
  return ProviderScope(
    child: MaterialApp.router(theme: AppTheme.lightTheme(googleFonts: false), routerConfig: router),
  );
}

Future<void> _phone(WidgetTester tester) async {
  tester.view.physicalSize = const Size(360 * 3, 800 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
}

DioException _dioError(int status, Map<String, dynamic> body) {
  final req = RequestOptions(path: '/auth/send-otp');
  return DioException(
    requestOptions: req,
    response: Response(requestOptions: req, statusCode: status, data: body),
    type: DioExceptionType.badResponse,
  );
}

void main() {
  late _Api api;
  setUpAll(() => FlutterSecureStorage.setMockInitialValues({}));
  setUp(() {
    api = _Api({'/auth/send-otp': (503, _smsOff)});
    apiService.dio.httpClientAdapter = api;
  });

  group('isSmsNotConfigured', () {
    test('only the SMS_NOT_CONFIGURED code counts, and the server sentence is used', () {
      final e = _dioError(503, _smsOff);
      expect(isSmsNotConfigured(e), isTrue);
      expect(smsNotConfiguredMessage(e), _smsOffMsg);
      expect(isSmsNotConfigured(_dioError(503, {'success': false, 'message': 'Busy'})), isFalse);
      expect(isSmsNotConfigured(_dioError(429, {'success': false, 'code': 'RATE_LIMITED'})), isFalse);
      expect(isSmsNotConfigured(Exception('x')), isFalse);
    });

    test('a 503 without its own sentence still says what to do', () {
      expect(smsNotConfiguredMessage(_dioError(503, {'code': 'SMS_NOT_CONFIGURED'})), kSmsNotConfiguredFallback);
    });
  });

  testWidgets('sign in with OTP: the server sentence shows and the screen returns to password sign-in',
      (tester) async {
    await _phone(tester);
    await tester.pumpWidget(_app('/auth/login'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OTP'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, '9123456780');
    await tester.tap(find.widgetWithText(ElevatedButton, 'Send OTP'));
    await tester.pumpAndSettle();

    expect(api.calls, ['/auth/send-otp']);
    expect(find.byType(OTPScreen), findsNothing);
    expect(find.text(_smsOffMsg), findsOneWidget);
    // Password path is back: the password field and "Sign in" button
    expect(find.widgetWithText(ElevatedButton, 'Sign in'), findsOneWidget);
    expect(find.text('Password'), findsWidgets);
    expect(find.widgetWithText(ElevatedButton, 'Send OTP'), findsNothing);
  });

  testWidgets('sign in with OTP: the same answer for a different number', (tester) async {
    await _phone(tester);
    await tester.pumpWidget(_app('/auth/login'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OTP'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).first, '9988776655');
    await tester.tap(find.widgetWithText(ElevatedButton, 'Send OTP'));
    await tester.pumpAndSettle();
    expect(find.byType(OTPScreen), findsNothing);
    expect(find.text(_smsOffMsg), findsOneWidget);
  });

  testWidgets('forgot password: stays on the first step with the server sentence and a way to sign in',
      (tester) async {
    await _phone(tester);
    await tester.pumpWidget(_app('/auth/forgot-password?mobile=9123456780'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Send OTP'));
    await tester.pumpAndSettle();

    final state = tester.state<ForgotPasswordScreenState>(find.byType(ForgotPasswordScreen));
    expect(state.step, ResetStep.mobile);
    expect(find.text(_smsOffMsg), findsOneWidget);
    expect(find.text('Enter the OTP'), findsNothing);

    await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in with password'));
    await tester.pumpAndSettle();
    expect(find.byType(LoginScreen), findsOneWidget);
  });

  testWidgets('forgot password: a resend that meets SMS_NOT_CONFIGURED goes back from the code step',
      (tester) async {
    await _phone(tester);
    api.answers['/auth/send-otp'] = (200, _sent);
    await tester.pumpWidget(_app('/auth/forgot-password?mobile=9123456780'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Send OTP'));
    await tester.pumpAndSettle();
    final state = tester.state<ForgotPasswordScreenState>(find.byType(ForgotPasswordScreen));
    expect(state.step, ResetStep.otp);

    api.answers['/auth/send-otp'] = (503, _smsOff);
    await tester.pump(const Duration(seconds: 31));
    await tester.tap(find.textContaining('Resend'));
    await tester.pumpAndSettle();
    expect(state.step, ResetStep.mobile);
    expect(find.text(_smsOffMsg), findsOneWidget);
    expect(find.widgetWithText(ElevatedButton, 'Sign in with password'), findsOneWidget);
  });

  testWidgets('OTP screen: a resend that meets SMS_NOT_CONFIGURED returns to sign in with the sentence',
      (tester) async {
    await _phone(tester);
    await tester.pumpWidget(_app('/auth/otp?mobile=9123456780'));
    await tester.pumpAndSettle(const Duration(seconds: 1));
    await tester.pump(const Duration(seconds: 31));
    await tester.tap(find.text('Resend OTP'));
    for (var i = 0; i < 10; i++) {
      await tester.pump(const Duration(milliseconds: 100)); // page transition; the snackbar stays 8 s
    }
    expect(find.byType(LoginScreen), findsOneWidget);
    expect(find.byType(OTPScreen), findsNothing);
    expect(find.descendant(of: find.byType(SnackBar), matching: find.text(_smsOffMsg)), findsOneWidget);
    await tester.pumpAndSettle(const Duration(seconds: 10));
  });

  group('Sprint 40 staff-only notification types', () {
    for (final t in ['gdp_excursion', 'self_inspection_overdue', 'chain_break']) {
      test('$t is known, staff-only and opens nothing in the app', () {
        expect(kNotificationKinds.containsKey(t), isTrue);
        expect(notificationKind(t).target, NotificationTarget.staff);
        expect(notificationKind(t).title, isNotEmpty);
        expect(notificationPath(t, orderId: 'ORD-1'), isNull);
      });
    }
  });
}
