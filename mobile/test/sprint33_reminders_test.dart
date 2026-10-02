import 'package:dawabag/models/reminder.dart';
import 'package:dawabag/screens/account/medicines/my_medicines_screen.dart';
import 'package:dawabag/services/dose_alarms.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 33: "My medicines" from the server's data, and phone alerts planned from
// GET /reminders/upcoming. Made-up medicine.
Reminder _reminder() => Reminder.fromJson({
      'id': 'r1', 'medicine_name': 'Vitamin D3', 'dose': '1 capsule', 'times': ['08:00', '20:00'], 'start_date': '2026-10-01',
      'end_date': null, 'source': 'order', 'is_active': true,
      'today': [
        {'time': '08:00', 'scheduled_for': '2026-10-05T02:30:00.000Z', 'status': 'taken'},
        {'time': '20:00', 'scheduled_for': '2026-10-05T14:30:00.000Z', 'status': null},
      ],
      'last_7_days': {'taken': 5, 'skipped': 1, 'missed': 2, 'total': 8},
    });

void main() {
  test('clock labels and reminder JSON', () {
    expect(clockLabel('08:00'), '8:00 am');
    expect(clockLabel('20:30'), '8:30 pm');
    expect(clockLabel('00:15'), '12:15 am');
    final r = _reminder();
    expect(r.fromOrder, isTrue);
    expect(r.today.first.status, 'taken');
    expect(r.taken7, 5);
  });

  test('phone alerts: future doses only, soonest first, same minute merged, no medicine name shown', () {
    final now = DateTime.utc(2026, 10, 5, 10);
    final doses = UpcomingDose.listFrom([
      {'reminder_id': 'r1', 'medicine_name': 'Vitamin D3', 'scheduled_for': '2026-10-05T14:30:00.000Z'},
      {'reminder_id': 'r2', 'medicine_name': 'Iron', 'scheduled_for': '2026-10-05T14:30:00.000Z'},
      {'reminder_id': 'r1', 'medicine_name': 'Vitamin D3', 'scheduled_for': '2026-10-05T02:30:00.000Z'},   // past
      {'reminder_id': 'r1', 'medicine_name': 'Vitamin D3', 'scheduled_for': '2026-10-06T02:30:00.000Z'},
    ]);
    final plan = planDoseAlarms(doses, now);
    expect(plan.length, 2);
    expect(plan.first.at, DateTime.utc(2026, 10, 5, 14, 30));
    expect(plan.first.id, kDoseAlarmBaseId);
    expect(plan.first.body, contains('these 2 doses'));
    expect(plan.map((a) => '${a.title} ${a.body}').join(' '), isNot(contains('Vitamin')));   // lock-screen privacy (C-41)
    expect(isDosePayload(plan.first.payload), isTrue);
    expect(planDoseAlarms(List.generate(100, (i) => UpcomingDose(reminderId: 'r', medicineName: 'x', at: now.add(Duration(hours: i + 1)))), now).length,
        kMaxDoseAlarms);
  });

  testWidgets('shows today’s doses with Taken / Skipped and sends the tap', (tester) async {
    final taps = <String>[];
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: MyMedicinesBody(
      reminders: [_reminder()],
      suggestions: const [ReminderSuggestion(productId: 'p1', medicineName: 'Paracetamol 650', orderId: 'o1', orderNumber: 'DB-1')],
      now: DateTime.utc(2026, 10, 5, 10),
      onAddFrom: (s) => taps.add('from ${s.orderNumber}'),
      onDose: (r, d, status) => taps.add('${d.time} $status'),
      onToggle: (_) => taps.add('toggle'),
      onEdit: (_) => taps.add('edit'),
      onDelete: (_) => taps.add('delete'),
    ))));
    expect(find.text('Vitamin D3'), findsOneWidget);
    expect(find.textContaining('1 capsule · 8:00 am, 8:00 pm · from your order'), findsOneWidget);
    expect(find.text('Taken'), findsWidgets);
    expect(find.text('Last 7 days: 5 taken, 1 skipped, 2 not answered'), findsOneWidget);
    expect(find.text('From your past orders'), findsOneWidget);
    // 8 pm is within 12 hours: it can be answered
    await tester.tap(find.widgetWithText(OutlinedButton, 'Skipped').last);
    await tester.tap(find.widgetWithText(OutlinedButton, 'Set reminder'));
    await tester.tap(find.text('Pause'));
    expect(taps, ['20:00 skipped', 'from DB-1', 'toggle']);
  });

  testWidgets('empty list explains what to do', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: MyMedicinesBody(
      reminders: const [], suggestions: const [], now: DateTime.utc(2026, 10, 5),
      onAddFrom: (_) {}, onDose: (_, __, ___) {}, onToggle: (_) {}, onEdit: (_) {}, onDelete: (_) {},
    ))));
    expect(find.textContaining('No reminders yet'), findsOneWidget);
  });
}
