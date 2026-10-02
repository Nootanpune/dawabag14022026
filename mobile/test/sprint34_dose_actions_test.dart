import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:dawabag/models/reminder.dart';
import 'package:dawabag/screens/account/medicines/my_medicines_screen.dart';
import 'package:dawabag/services/dose_action_background.dart';
import 'package:dawabag/services/dose_actions.dart';
import 'package:dawabag/services/dose_alarms.dart';
import 'package:dawabag/services/local_notifications.dart';
import 'package:dawabag/services/notification_tap_router.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

// Sprint 34: dose alerts survive a restart (boot receiver), carry "Taken" and
// "Skip" that send the answer to the server, and open My medicines on that dose
// when they cannot. The alert never names the medicine (C-41). Made-up data.

/// Answers like the API; records what was asked.
class _FakeApi implements HttpClientAdapter {
  final List<String> calls = [];
  final List<Object?> bodies = [];
  final List<String?> auth = [];
  int refreshStatus = 200;
  int doseStatus = 201;

  @override
  Future<ResponseBody> fetch(RequestOptions o, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    calls.add('${o.method} ${o.path}');
    bodies.add(o.data);
    auth.add(o.headers['Authorization']?.toString());
    final headers = {Headers.contentTypeHeader: [Headers.jsonContentType]};
    if (o.path == '/auth/refresh') {
      final body = refreshStatus == 200
          ? {'success': true, 'data': {'access_token': 'access-new', 'refresh_token': 'refresh-new'}}
          : {'success': false, 'message': 'Invalid token'};
      return ResponseBody.fromString(jsonEncode(body), refreshStatus, headers: headers);
    }
    return ResponseBody.fromString(jsonEncode({'success': true, 'data': {}}), doseStatus, headers: headers);
  }

  @override
  void close({bool force = false}) {}
}

Reminder _reminder(String id, String name) => Reminder.fromJson({
      'id': id, 'medicine_name': name, 'dose': '1 tablet', 'times': ['08:00', '20:00'], 'start_date': '2026-10-01',
      'source': 'manual', 'is_active': true,
      'today': [
        {'time': '08:00', 'scheduled_for': '2026-10-05T02:30:00.000Z', 'status': 'taken'},
        {'time': '20:00', 'scheduled_for': '2026-10-05T14:30:00.000Z', 'status': null},
      ],
    });

void main() {
  group('alert payload and actions', () {
    test('payload carries every reminder due at that minute, ids only (no medicine name, C-41)', () {
      final now = DateTime.utc(2026, 10, 5, 10);
      final plan = planDoseAlarms(UpcomingDose.listFrom([
        {'reminder_id': 'r1', 'medicine_name': 'Vitamin D3', 'scheduled_for': '2026-10-05T14:30:00.000Z'},
        {'reminder_id': 'r2', 'medicine_name': 'Iron', 'scheduled_for': '2026-10-05T14:30:00.000Z'},
      ]), now);
      expect(plan, hasLength(1));
      final a = plan.single;
      expect(a.payload, 'dose:r1,r2@2026-10-05T14:30:00.000Z');
      expect('${a.title} ${a.body} ${a.payload}', isNot(contains('Vitamin')));
      expect('${a.title} ${a.body} ${a.payload}', isNot(contains('Iron')));
      final d = parseDosePayload(a.payload)!;
      expect(d.reminderIds, ['r1', 'r2']);
      expect(d.at, DateTime.utc(2026, 10, 5, 14, 30));
    });

    test('damaged or foreign payloads are ignored; buttons map to the server words', () {
      expect(parseDosePayload(null), isNull);
      expect(parseDosePayload('order-123'), isNull);
      expect(parseDosePayload('dose:@2026-10-05T14:30:00.000Z'), isNull);
      expect(parseDosePayload('dose:r1@not-a-time'), isNull);
      expect(parseDosePayload('dose:r1@2026-10-05T14:30:00.000Z')!.reminderIds, ['r1']);   // Sprint 33 alerts still read
      expect(doseStatusForAction(kDoseActionTaken), 'taken');
      expect(doseStatusForAction(kDoseActionSkip), 'skipped');
      expect(doseStatusForAction(null), isNull);
    });

    test('My medicines link highlights the dose and reads back', () {
      const dose = DoseRef(reminderIds: ['r1', 'r2'], scheduledFor: '2026-10-05T14:30:00.000Z');
      final loc = myMedicinesLocation(dose);
      final uri = Uri.parse(loc);
      expect(uri.path, '/account/medicines');
      final back = doseFromQuery(uri.queryParameters)!;
      expect(back.reminderIds, ['r1', 'r2']);
      expect(back.scheduledFor, '2026-10-05T14:30:00.000Z');
      expect(myMedicinesLocation(), '/account/medicines');
      expect(doseFromQuery(const {}), isNull);
    });

    test('Android alert has Taken and Skip (background, closes the alert); iOS uses the category', () {
      final actions = kDoseNotificationDetails.android!.actions!;
      expect(actions.map((a) => a.id), [kDoseActionTaken, kDoseActionSkip]);
      expect(actions.map((a) => a.title), ['Taken', 'Skip']);
      expect(actions.every((a) => !a.showsUserInterface && a.cancelNotification), isTrue);
      expect(kDoseNotificationDetails.android!.visibility, NotificationVisibility.private);
      expect(kDoseNotificationDetails.iOS!.categoryIdentifier, kDoseCategoryId);
      final cat = LocalNotifications.doseCategory;
      expect(cat.identifier, kDoseCategoryId);
      expect(cat.actions.map((a) => a.title), ['Taken', 'Skip']);
      expect(cat.actions.every((a) => a.options.contains(DarwinNotificationActionOption.authenticationRequired)), isTrue);
    });

    test('Android manifest: restart receiver and the action receiver are declared', () {
      final manifest = File('android/app/src/main/AndroidManifest.xml').readAsStringSync();
      expect(manifest, contains('android.permission.RECEIVE_BOOT_COMPLETED'));
      expect(manifest, contains('com.dexterous.flutterlocalnotifications.ScheduledNotificationBootReceiver'));
      expect(manifest, contains('android.intent.action.BOOT_COMPLETED'));
      expect(manifest, contains('com.dexterous.flutterlocalnotifications.ActionBroadcastReceiver'));
    });
  });

  group('sending the answer', () {
    test('every reminder in the alert is answered; one failure reports not saved', () async {
      final sent = <String>[];
      const dose = DoseRef(reminderIds: ['r1', 'r2'], scheduledFor: '2026-10-05T14:30:00.000Z');
      expect(await answerDoseAlert((id, at, s) async => sent.add('$id $at $s'), dose, 'taken'), isTrue);
      expect(sent, ['r1 2026-10-05T14:30:00.000Z taken', 'r2 2026-10-05T14:30:00.000Z taken']);
      final ok = await answerDoseAlert((id, at, s) async {
        if (id == 'r1') throw Exception('offline');
        sent.add(id);
      }, dose, 'skipped');
      expect(ok, isFalse);
      expect(sent.last, 'r2', reason: 'the other dose is still sent');
    });

    test('background: signs in with the keychain token, stores the new one, posts the same adherence call', () async {
      final api = _FakeApi();
      String? stored = 'refresh-old';
      final client = BackgroundDoseClient(
        dio: Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))..httpClientAdapter = api,
        readRefreshToken: () async => stored,
        writeRefreshToken: (t) async => stored = t,
      );
      const dose = DoseRef(reminderIds: ['r1'], scheduledFor: '2026-10-05T14:30:00.000Z');
      expect(await client.answer(dose, 'taken'), isTrue);
      expect(api.calls, ['POST /auth/refresh', 'POST /reminders/r1/doses']);
      expect(api.bodies.first, {'refresh_token': 'refresh-old'});
      expect(api.bodies.last, {'scheduled_for': '2026-10-05T14:30:00.000Z', 'status': 'taken'});
      expect(api.auth.last, 'Bearer access-new');
      expect(stored, 'refresh-new', reason: 'the rotated refresh token replaces the old one (keychain only)');
    });

    test('background: signed out or refused → not saved, and the keychain token is left alone', () async {
      final api = _FakeApi()..refreshStatus = 401;
      var writes = 0;
      final client = BackgroundDoseClient(
        dio: Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))..httpClientAdapter = api,
        readRefreshToken: () async => 'refresh-old',
        writeRefreshToken: (_) async => writes++,
      );
      const dose = DoseRef(reminderIds: ['r1'], scheduledFor: '2026-10-05T14:30:00.000Z');
      expect(await client.answer(dose, 'skipped'), isFalse);
      expect(writes, 0);
      expect(api.calls, ['POST /auth/refresh']);

      final none = BackgroundDoseClient(
        dio: Dio()..httpClientAdapter = api, readRefreshToken: () async => null, writeRefreshToken: (_) async {});
      expect(await none.answer(dose, 'taken'), isFalse);

      final api2 = _FakeApi()..doseStatus = 400;   // e.g. not a real dose time
      final refused = BackgroundDoseClient(
        dio: Dio(BaseOptions(baseUrl: 'https://api.test/api/v1'))..httpClientAdapter = api2,
        readRefreshToken: () async => 'r', writeRefreshToken: (_) async {});
      expect(await refused.answer(dose, 'taken'), isFalse);
    });
  });

  group('My medicines opened from an alert', () {
    testWidgets('a tapped alert (or one whose answer failed) opens My medicines on that dose', (tester) async {
      Uri? opened;
      final router = GoRouter(routes: [
        GoRoute(path: '/', builder: (_, __) => const Text('home')),
        GoRoute(path: '/account/medicines', builder: (_, s) {
          opened = s.uri;
          return const Text('my medicines');
        }),
      ]);
      await tester.pumpWidget(MaterialApp.router(routerConfig: router));
      NotificationTapRouter.attach(router);
      NotificationTapRouter.setSignedIn(true);
      NotificationTapRouter.openLocalPayload('dose:r2@2026-10-05T14:30:00.000Z');
      await tester.pumpAndSettle();
      expect(find.text('my medicines'), findsOneWidget);
      expect(doseFromQuery(opened!.queryParameters)!.reminderIds, ['r2']);
      NotificationTapRouter.setSignedIn(false);
    });

    testWidgets('the dose is highlighted and fits 360 dp at 130 % text with the app’s button theme', (tester) async {
      tester.view.physicalSize = const Size(360 * 3, 760 * 3);
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final taps = <String>[];
      await tester.pumpWidget(MaterialApp(
        theme: ThemeData(
          outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 48))),
        ),
        builder: (context, child) => MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(1.3)),
          child: child!,
        ),
        home: Scaffold(
          body: MyMedicinesBody(
            reminders: [_reminder('r1', 'Vitamin D3'), _reminder('r2', 'Iron and folic acid tablets with a long name')],
            suggestions: const [ReminderSuggestion(productId: 'p1', medicineName: 'Paracetamol 650', orderId: 'o1', orderNumber: 'DB-1')],
            now: DateTime.utc(2026, 10, 5, 10),
            highlight: const DoseRef(reminderIds: ['r2'], scheduledFor: '2026-10-05T14:30:00.000Z'),
            onAddFrom: (_) {},
            onDose: (r, d, s) => taps.add('${r.id} ${d.time} $s'),
            onToggle: (_) {},
            onEdit: (_) {},
            onDelete: (_) {},
          ),
        ),
      ));
      await tester.pumpAndSettle();
      expect(tester.takeException(), isNull);
      expect(find.textContaining('Mark the dose from your reminder below'), findsOneWidget);
      final highlighted = find.byKey(const ValueKey('highlighted-dose'));
      expect(highlighted, findsOneWidget);
      await tester.tap(find.descendant(of: highlighted, matching: find.widgetWithText(OutlinedButton, 'Taken')));
      expect(taps, ['r2 20:00 taken']);
    });
  });
}
