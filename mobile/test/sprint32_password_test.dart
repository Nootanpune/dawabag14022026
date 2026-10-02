import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:dawabag/config/password_gate.dart';
import 'package:dawabag/screens/account/password/change_password_form.dart';
import 'package:dawabag/services/api_service.dart';
import 'package:dawabag/services/api_utils.dart';
import 'package:dawabag/utils/password_policy.dart';

// Sprint 32: logins made by Dawabag's admin with a temporary password must choose
// their own first. The server refuses every other call with 403
// PASSWORD_CHANGE_REQUIRED (backend auth.middleware); the app routes to the form.

/// Answers every request with [status] and [body] (no network).
class _FakeAdapter implements HttpClientAdapter {
  final int status;
  final Map<String, dynamic> body;
  _FakeAdapter(this.status, this.body);

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async =>
      ResponseBody.fromString(jsonEncode(body), status, headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      });

  @override
  void close({bool force = false}) {}
}

DioException _error(int status, Map<String, dynamic> body) => DioException(
      requestOptions: RequestOptions(path: '/orders'),
      response: Response(requestOptions: RequestOptions(path: '/orders'), statusCode: status, data: body),
    );

void main() {
  group('password rules (mirror of backend utils/passwordPolicy.ts)', () {
    test('same words as the server', () {
      expect(passwordProblem('abc12'), 'Password must be at least 8 characters');
      expect(passwordProblem('abcdefgh'), 'Password must contain at least one letter and one number');
      expect(passwordProblem('12345678'), 'Password must contain at least one letter and one number');
      expect(passwordProblem(' abcd1234'), 'Password cannot start or end with a space');
      expect(passwordProblem('a9876543210', mobile: '9876543210'), 'Password cannot contain the mobile number');
      expect(passwordProblem('${'a1' * 36}x'), 'Password must be at most 72 characters');
      expect(passwordProblem('Kmrt7392Hpwa', mobile: '9876543210'), isNull);
    });
    test('the form: current, twice the same, and a new one', () {
      expect(changePasswordProblem(current: '', next: 'abcd1234', again: 'abcd1234'), 'Enter your current password');
      expect(changePasswordProblem(current: 'Temp-1234', next: 'abcd1234', again: 'abcd1235'),
          'The two new passwords are not the same');
      expect(changePasswordProblem(current: 'abcd1234', next: 'abcd1234', again: 'abcd1234'),
          'Choose a new password that is different from the current one');
      expect(changePasswordProblem(current: 'Temp-1234', next: 'abcd1234', again: 'abcd1234'), isNull);
    });
  });

  group('the server\'s code', () {
    test('only 403 with PASSWORD_CHANGE_REQUIRED counts', () {
      expect(isPasswordChangeRequired(_error(403, {'message': 'x', 'code': 'PASSWORD_CHANGE_REQUIRED'})), isTrue);
      expect(isPasswordChangeRequired(_error(403, {'message': 'Account deactivated'})), isFalse);
      expect(isPasswordChangeRequired(_error(401, {'code': 'PASSWORD_CHANGE_REQUIRED'})), isFalse);
    });

    test('the API client tells the app when any call comes back with it', () async {
      final previous = apiService.dio.httpClientAdapter;
      var told = 0;
      apiService.onPasswordChangeRequired = () => told++;
      apiService.dio.httpClientAdapter = _FakeAdapter(403, {
        'success': false,
        'message': 'Please choose a new password before continuing',
        'code': 'PASSWORD_CHANGE_REQUIRED',
      });
      try {
        await apiService.dio.get('/orders');
        fail('should have thrown');
      } on DioException catch (e) {
        expect(ApiService.errorMessage(e), 'Please choose a new password before continuing');
      } finally {
        apiService.dio.httpClientAdapter = previous;
        apiService.onPasswordChangeRequired = null;
      }
      expect(told, 1);
    });
  });

  group('routing', () {
    test('every page leads to the change-password screen until it is done', () {
      expect(passwordGateRedirect(Uri.parse('/orders'), loggedIn: true, mustChange: true),
          '/account/change-password?required=1&next=%2Forders');
      expect(passwordGateRedirect(Uri.parse('/'), loggedIn: true, mustChange: true), '/account/change-password?required=1');
      expect(passwordGateRedirect(Uri.parse('/auth/login'), loggedIn: true, mustChange: true),
          '/account/change-password?required=1');
      expect(passwordGateRedirect(Uri.parse('/account/change-password?required=1'), loggedIn: true, mustChange: true),
          isNull);
      expect(passwordGateRedirect(Uri.parse('/orders'), loggedIn: true, mustChange: false), isNull);
      expect(passwordGateRedirect(Uri.parse('/orders'), loggedIn: false, mustChange: true), isNull);
    });

    test('continues only to a page inside the app', () {
      expect(continueAfterPasswordChange('/orders'), '/orders');
      expect(continueAfterPasswordChange(null), '/');
      expect(continueAfterPasswordChange('//evil.example'), '/');
      expect(continueAfterPasswordChange('https://evil.example'), '/');
      expect(changePasswordLocation(), '/account/change-password');
    });

    testWidgets('a forced change opens the form, then continues where the person was going', (tester) async {
      final mustChange = ValueNotifier<bool>(false);
      final router = GoRouter(
        initialLocation: '/orders',
        refreshListenable: mustChange,
        redirect: (_, state) => passwordGateRedirect(state.uri, loggedIn: true, mustChange: mustChange.value),
        routes: [
          GoRoute(path: '/', builder: (_, __) => const Text('Home')),
          GoRoute(path: '/orders', builder: (_, __) => const Text('My orders')),
          GoRoute(
            path: kChangePasswordPath,
            builder: (c, s) => Scaffold(
              body: ChangePasswordForm(
                temporary: s.uri.queryParameters['required'] == '1',
                onSubmit: (current, next) async {
                  mustChange.value = false; // the server cleared the flag
                  c.go(continueAfterPasswordChange(s.uri.queryParameters['next']));
                  return null;
                },
              ),
            ),
          ),
        ],
      );
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      expect(find.text('My orders'), findsOneWidget);

      // The server answered 403 PASSWORD_CHANGE_REQUIRED (or login said so)
      mustChange.value = true;
      await tester.pumpAndSettle();
      expect(find.text('Current password (the temporary one you were given)'), findsOneWidget);

      // Rules are checked before anything is sent
      await tester.tap(find.text('Save new password'));
      await tester.pump();
      expect(find.text('Enter your current password'), findsOneWidget);

      final fields = find.byType(TextField);
      await tester.enterText(fields.at(0), 'Kmrt-7392-Hpwa');
      await tester.enterText(fields.at(1), 'short1');
      await tester.enterText(fields.at(2), 'short1');
      await tester.tap(find.text('Save new password'));
      await tester.pump();
      expect(find.text('Password must be at least 8 characters'), findsOneWidget);

      await tester.enterText(fields.at(1), 'mynewpass42');
      await tester.enterText(fields.at(2), 'mynewpass42');
      await tester.tap(find.text('Save new password'));
      await tester.pumpAndSettle();
      expect(find.text('My orders'), findsOneWidget);
      router.dispose();
      mustChange.dispose();
    });

    testWidgets('the server\'s refusal is shown in plain words', (tester) async {
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: ChangePasswordForm(onSubmit: (_, __) async => 'Your current password is not right'),
        ),
      ));
      final fields = find.byType(TextField);
      await tester.enterText(fields.at(0), 'wrong-one1');
      await tester.enterText(fields.at(1), 'mynewpass42');
      await tester.enterText(fields.at(2), 'mynewpass42');
      await tester.tap(find.text('Save new password'));
      await tester.pump();
      expect(find.text('Your current password is not right'), findsOneWidget);
      expect(find.text('Current password'), findsOneWidget);
    });
  });
}
