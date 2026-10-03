import 'dart:convert';
import 'dart:typed_data';

import 'package:dawabag/config/theme.dart';
import 'package:dawabag/screens/auth/forgot_password/forgot_password_screen.dart';
import 'package:dawabag/screens/auth/login_screen.dart';
import 'package:dawabag/screens/auth/otp_screen.dart';
import 'package:dawabag/screens/info/info_page_screen.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/password_reset_api.dart';
import 'package:dawabag/widgets/home/trust_strip.dart';
import 'package:dawabag/widgets/otp_input.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

// Sprint 36 (app): since Sprint 35 POST /auth/send-otp answers the same for
// every mobile (no 404 for an unregistered one, so accounts cannot be probed;
// C-41 / C-44). The app's words are neutral and nothing depends on a 404.
// Also: the renamed trust page comes from the server under the same slug.

const _neutral = {
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
    GoRoute(path: '/', builder: (c, s) => const Scaffold(body: TrustStrip())),
    GoRoute(path: '/auth/login', builder: (c, s) => const LoginScreen()),
    GoRoute(path: '/auth/otp', builder: (c, s) => OTPScreen(mobile: s.uri.queryParameters['mobile'] ?? '')),
    GoRoute(
      path: '/auth/forgot-password',
      builder: (c, s) => ForgotPasswordScreen(initialMobile: s.uri.queryParameters['mobile'] ?? ''),
    ),
    GoRoute(path: '/trust/:key', builder: (c, s) => InfoPageScreen(pageKey: s.pathParameters['key']!)),
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

void main() {
  late _Api api;
  setUpAll(() => FlutterSecureStorage.setMockInitialValues({}));
  setUp(() {
    api = _Api({'/auth/send-otp': (200, _neutral)});
    apiService.dio.httpClientAdapter = api;
  });

  test('the neutral sentence never claims the number has an account', () {
    expect(codeSentText('9876543210'), "If +91 9876543210 has a Dawabag account, we've sent a 6-digit code to it.");
  });

  testWidgets('forgot password: the code step says the same for any number', (tester) async {
    await _phone(tester);
    await tester.pumpWidget(_app('/auth/forgot-password?mobile=9123456780'));
    await tester.pumpAndSettle();
    expect(find.textContaining("If it has a Dawabag account, we'll send a"), findsOneWidget);
    await tester.tap(find.widgetWithText(ElevatedButton, 'Send OTP'));
    await tester.pumpAndSettle();
    expect(find.text(codeSentText('9123456780')), findsOneWidget);
    expect(find.textContaining('We sent'), findsNothing);
  });

  testWidgets('a mobile with no account: the reset answer sends the person back to the code step', (tester) async {
    await _phone(tester);
    api.answers['/auth/reset-password'] = (400, {'success': false, 'message': 'The code is wrong or has expired'});
    await tester.pumpWidget(_app('/auth/forgot-password?mobile=9123456780'));
    await tester.pumpAndSettle();
    await tester.tap(find.widgetWithText(ElevatedButton, 'Send OTP'));
    await tester.pumpAndSettle();
    final boxes = find.descendant(of: find.byType(OtpInput), matching: find.byType(TextFormField));
    for (var i = 0; i < 6; i++) {
      await tester.enterText(boxes.at(i), '${i + 1}');
    }
    await tester.tap(find.widgetWithText(ElevatedButton, 'Continue'));
    await tester.pumpAndSettle();
    final fields = find.byType(TextField);
    await tester.enterText(fields.at(0), 'Kmrt7392Hpwa');
    await tester.enterText(fields.at(1), 'Kmrt7392Hpwa');
    await tester.tap(find.widgetWithText(ElevatedButton, 'Save new password'));
    await tester.pumpAndSettle();
    expect(find.text('Enter the OTP'), findsOneWidget);
    expect(find.text('The code is wrong or has expired'), findsOneWidget);
  });

  testWidgets('sign in with OTP: neutral words before and after sending, and on resend', (tester) async {
    await _phone(tester);
    await tester.pumpWidget(_app('/auth/login'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OTP'));
    await tester.pumpAndSettle();
    expect(find.text("If this number has a Dawabag account, we'll send a 6-digit code to it."), findsOneWidget);
    await tester.enterText(find.byType(TextFormField).first, '9123456780');
    await tester.tap(find.widgetWithText(ElevatedButton, 'Send OTP'));
    await tester.pumpAndSettle();
    expect(find.byType(OTPScreen), findsOneWidget);
    expect(find.text('Enter the 6-digit code'), findsOneWidget);
    expect(find.text(codeSentText('9123456780')), findsOneWidget);
    // Resend after the timer: still neutral
    await tester.pump(const Duration(seconds: 31));
    await tester.tap(find.text('Resend OTP'));
    for (var i = 0; i < 5; i++) {
      await tester.pump(const Duration(milliseconds: 100));
    }
    expect(find.descendant(of: find.byType(SnackBar), matching: find.text(codeSentText('9123456780'))), findsOneWidget);
    await tester.pumpAndSettle(const Duration(seconds: 5));
  });

  testWidgets('trust: "Pharmacist-checked" opens the server page with its Sprint 35 title', (tester) async {
    api.answers['/info-pages/pharmacist-checked'] = (
      200,
      {
        'success': true,
        'data': {
          'page_key': 'pharmacist-checked',
          'version': 2,
          'title': 'Every order is checked by a pharmacist',
          'summary': 'A registered pharmacist checks every order.',
          'body': '## Every order, before packing\nEvery order is checked.',
        }
      }
    );
    await _phone(tester);
    await tester.pumpWidget(_app('/'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Pharmacist-checked'));
    await tester.pumpAndSettle();
    expect(api.calls.last, contains('pharmacist-checked'));
    expect(find.text('Every order is checked by a pharmacist'), findsWidgets);
  });
}
