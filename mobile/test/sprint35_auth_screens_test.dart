import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:dawabag/config/theme.dart';
import 'package:dawabag/screens/auth/forgot_password/forgot_password_screen.dart';
import 'package:dawabag/screens/auth/login_screen.dart';
import 'package:dawabag/screens/auth/register/register_screen.dart';
import 'package:dawabag/screens/auth/welcome_screen.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/password_reset_api.dart';
import 'package:dawabag/utils/password_policy.dart';
import 'package:dawabag/widgets/brand/brand_logo.dart';
import 'package:dawabag/widgets/brand/labeled_field.dart';
import 'package:dawabag/widgets/otp_input.dart';

// Sprint 35: DAWA BAG restyle of the welcome, sign-in, forgot-password pages.
// Flows unchanged (mobile + password or OTP sign-in, OTP before a new password);
// labels above fields; no "fastest" claim (C-17).

/// Answers by path; records each call's path and JSON body.
class _Api implements HttpClientAdapter {
  final Map<String, (int, Map<String, dynamic>)> answers;
  final calls = <(String, Object?)>[];
  _Api(this.answers);

  @override
  Future<ResponseBody> fetch(
      RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add((options.path, options.data));
    final (status, body) =
        answers[options.path] ?? (404, {'success': false, 'message': 'Route POST ${options.path} not found'});
    return ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });
  }

  @override
  void close({bool force = false}) {}
}

Widget _app(String initial) {
  final router = GoRouter(initialLocation: initial, routes: [
    GoRoute(path: '/', builder: (c, s) => const Scaffold(body: Text('Shop home'))),
    GoRoute(path: '/welcome', builder: (c, s) => const WelcomeScreen()),
    GoRoute(path: '/auth/login', builder: (c, s) => const LoginScreen()),
    GoRoute(path: '/auth/register', builder: (c, s) => const RegisterScreen()),
    GoRoute(path: '/auth/otp', builder: (c, s) => Scaffold(body: Text('OTP for ${s.uri.queryParameters['mobile']}'))),
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

/// A [LabeledField]'s label sits above its field, not inside it.
void _expectLabelAbove(WidgetTester tester, String label) {
  final text = find.descendant(of: find.byType(LabeledField), matching: find.text(label));
  expect(text, findsOneWidget, reason: label);
  final field = find.ancestor(of: text, matching: find.byType(LabeledField));
  final input = find.descendant(of: field, matching: find.byType(EditableText));
  expect(tester.getBottomLeft(text).dy, lessThanOrEqualTo(tester.getTopLeft(input).dy), reason: label);
}

void main() {
  late _Api api;
  setUpAll(() => FlutterSecureStorage.setMockInitialValues({}));
  setUp(() {
    api = _Api({
      '/auth/send-otp': (
        200,
        {
          'success': true,
          'message': 'OTP sent',
          'data': {'otp_sent': true}
        }
      ),
    });
    apiService.dio.httpClientAdapter = api;
  });

  group('welcome', () {
    testWidgets('logo, the corrected headline and Get started', (tester) async {
      await _phone(tester);
      await tester.pumpWidget(_app('/welcome'));
      await tester.pumpAndSettle();
      expect(find.byType(BrandLogo), findsOneWidget);
      expect(find.text(WelcomeScreen.headline), findsOneWidget);
      expect(find.textContaining(RegExp('fastest', caseSensitive: false)), findsNothing); // C-17
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Get started'));
      await tester.pumpAndSettle();
      expect(find.text('Shop home'), findsOneWidget);
    });

    testWidgets('Sign in opens the sign-in page', (tester) async {
      await _phone(tester);
      await tester.pumpWidget(_app('/welcome'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(OutlinedButton, 'Sign in'));
      await tester.pumpAndSettle();
      expect(find.byType(LoginScreen), findsOneWidget);
    });
  });

  group('sign in', () {
    testWidgets('labels above the fields; validation words unchanged', (tester) async {
      await _phone(tester);
      await tester.pumpWidget(_app('/auth/login'));
      await tester.pumpAndSettle();
      _expectLabelAbove(tester, 'Mobile number');
      _expectLabelAbove(tester, 'Password');
      await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
      await tester.pumpAndSettle();
      expect(find.text('Mobile number required'), findsOneWidget);
      expect(find.text('Password required'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField).first, '1234567890');
      await tester.tap(find.widgetWithText(ElevatedButton, 'Sign in'));
      await tester.pumpAndSettle();
      expect(find.text('Enter valid 10-digit number'), findsOneWidget);
    });

    testWidgets('sign in with OTP sends it and opens the OTP page', (tester) async {
      await _phone(tester);
      await tester.pumpWidget(_app('/auth/login'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('OTP'));
      await tester.pumpAndSettle();
      expect(find.text('Forgot password?'), findsNothing);
      expect(find.byType(LabeledField), findsOneWidget); // mobile only
      await tester.enterText(find.byType(TextFormField).first, '9876543210');
      await tester.tap(find.widgetWithText(ElevatedButton, 'Send OTP'));
      await tester.pumpAndSettle();
      expect(api.calls.single.$1, '/auth/send-otp');
      expect(find.text('OTP for 9876543210'), findsOneWidget);
    });

    testWidgets('Forgot password? carries the mobile typed so far', (tester) async {
      await _phone(tester);
      await tester.pumpWidget(_app('/auth/login'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField).first, '9876543210');
      await tester.tap(find.text('Forgot password?'));
      await tester.pumpAndSettle();
      final page = find.byType(ForgotPasswordScreen);
      expect(page, findsOneWidget);
      expect(find.descendant(of: page, matching: find.widgetWithText(TextFormField, '9876543210')), findsOneWidget);
    });
  });

  group('forgot password: OTP first, then the new password', () {
    Future<void> throughOtp(WidgetTester tester) async {
      await _phone(tester);
      await tester.pumpWidget(_app('/auth/forgot-password?mobile=9876543210'));
      await tester.pumpAndSettle();
      _expectLabelAbove(tester, 'Mobile number');
      await tester.tap(find.widgetWithText(ElevatedButton, 'Send OTP'));
      await tester.pumpAndSettle();
      expect(find.text('Enter the OTP'), findsOneWidget);
      // Continue needs all six digits
      await tester.tap(find.widgetWithText(ElevatedButton, 'Continue'));
      await tester.pump();
      expect(find.text('Enter the 6-digit OTP'), findsOneWidget);
      final boxes = find.descendant(of: find.byType(OtpInput), matching: find.byType(TextFormField));
      for (var i = 0; i < 6; i++) {
        await tester.enterText(boxes.at(i), '${i + 1}');
      }
      await tester.tap(find.widgetWithText(ElevatedButton, 'Continue'));
      await tester.pumpAndSettle();
      expect(find.text('Choose a new password'), findsOneWidget);
      _expectLabelAbove(tester, 'New password');
      _expectLabelAbove(tester, 'Confirm new password');
    }

    Future<void> enterPasswords(WidgetTester tester, String a, String b) async {
      final fields = find.byType(TextField);
      await tester.enterText(fields.at(0), a);
      await tester.enterText(fields.at(1), b);
      await tester.tap(find.widgetWithText(ElevatedButton, 'Save new password'));
      await tester.pumpAndSettle();
    }

    testWidgets('sends mobile, OTP and new password; then back to sign in', (tester) async {
      api.answers['/auth/reset-password'] = (200, {'success': true, 'message': 'Password changed'});
      await throughOtp(tester);
      await enterPasswords(tester, 'Kmrt7392Hpwa', 'Kmrt7392Hpw');
      expect(find.text('The two new passwords are not the same'), findsOneWidget);
      await enterPasswords(tester, 'Kmrt7392Hpwa', 'Kmrt7392Hpwa');
      expect(api.calls.last.$1, '/auth/reset-password');
      expect(api.calls.last.$2, {'mobile': '9876543210', 'otp': '123456', 'new_password': 'Kmrt7392Hpwa'});
      expect(find.text('Password changed'), findsOneWidget);
      await tester.tap(find.text('Go to sign in'));
      await tester.pumpAndSettle();
      expect(find.byType(LoginScreen), findsOneWidget);
    });

    testWidgets('a wrong OTP goes back to the OTP step with the server\'s words', (tester) async {
      api.answers['/auth/reset-password'] = (400, {'success': false, 'message': 'Invalid or expired OTP'});
      await throughOtp(tester);
      await enterPasswords(tester, 'Kmrt7392Hpwa', 'Kmrt7392Hpwa');
      expect(find.text('Enter the OTP'), findsOneWidget);
      expect(find.text('Invalid or expired OTP'), findsOneWidget);
    });

    testWidgets('a server without the reset step offers sign-in with the OTP', (tester) async {
      await throughOtp(tester); // no answer for /auth/reset-password → the API's "Route … not found"
      await enterPasswords(tester, 'Kmrt7392Hpwa', 'Kmrt7392Hpwa');
      expect(find.text('Sign in with the OTP instead'), findsOneWidget);
      await tester.tap(find.text('Sign in with OTP'));
      await tester.pumpAndSettle();
      expect(find.text('OTP for 9876543210'), findsOneWidget);
    });
  });

  group('sign up', () {
    testWidgets('logo, then the details with labels above and the server\'s password rules', (tester) async {
      await _phone(tester);
      await tester.pumpWidget(_app('/auth/register'));
      await tester.pumpAndSettle();
      expect(find.byType(BrandLogo), findsOneWidget);
      await tester.tap(find.text('Patient / Individual (B2C)'));
      await tester.pumpAndSettle();
      await tester.scrollUntilVisible(find.widgetWithText(ElevatedButton, 'Continue'), 200,
          scrollable: find.byType(Scrollable).first);
      await tester.tap(find.widgetWithText(ElevatedButton, 'Continue'));
      await tester.pumpAndSettle();
      for (final label in ['Full name', 'Mobile number', 'Password', 'Confirm password']) {
        await tester.scrollUntilVisible(find.descendant(of: find.byType(LabeledField), matching: find.text(label)), 150,
            scrollable: find.byType(Scrollable).first);
        await tester.pumpAndSettle();
        _expectLabelAbove(tester, label);
      }
      expect(find.text(kPasswordRules), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  });

  test('reset rules use the server\'s words', () {
    expect(resetPasswordProblem(next: 'abc', again: 'abc'), 'Password must be at least 8 characters');
    expect(resetPasswordProblem(next: 'abcd1234', again: 'abcd1235'), 'The two new passwords are not the same');
    expect(resetPasswordProblem(next: 'a9876543210', again: 'a9876543210', mobile: '9876543210'),
        'Password cannot contain the mobile number');
    expect(resetPasswordProblem(next: 'Kmrt7392Hpwa', again: 'Kmrt7392Hpwa'), isNull);
  });

  test('an unknown route is told apart from a real 404 answer', () {
    expect(isMissingRoute({'message': 'Route POST /api/v1/auth/reset-password not found'}), isTrue);
    expect(isMissingRoute({'message': 'Mobile not registered'}), isFalse);
    expect(isMissingRoute('<html>'), isTrue);
  });
}
