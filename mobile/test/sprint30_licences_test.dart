import 'package:dawabag/models/drug_licence.dart';
import 'package:dawabag/screens/account/licences/licences_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 30: a business account's drug licences as the API returns them. Made-up numbers.
Map<String, dynamic> _row(String form, String label, String number, String upto, String validity, {String status = 'verified'}) =>
    {'id': 'id-$form', 'form': form, 'label': label, 'licence_number': number, 'valid_upto': upto, 'status': status, 'validity': validity};

void main() {
  test('reads every licence and the plain status words', () {
    final s = DrugLicenceSummary.fromJson({
      'licences': [
        _row('dl20', 'Form 20', 'TEST-20-1', '2028-01-31', 'valid'),
        _row('dl21', 'Form 21', 'TEST-21-1', '2026-09-30', 'expired'),
        _row('dl21', 'Form 21', 'TEST-21-2', '2031-09-30', 'valid', status: 'pending'),
      ],
      'can_trade': false,
      'problems': ['Form 21 licence TEST-21-1 expired on 2026-09-30'],
      'warnings': [],
    });
    expect(s.licences.length, 3);
    expect(s.canTrade, isFalse);
    expect(s.licences[0].statusText, 'Valid');
    expect(s.licences[1].statusText, 'Expired');
    expect(s.licences[1].needsAttention, isTrue);
    expect(s.licences[2].statusText, 'Waiting for Dawabag’s check');
    expect(kLicenceAccountTypes.contains('b2b_wholesaler'), isTrue);
    expect(kLicenceAccountTypes.contains('customer'), isFalse);
  });

  testWidgets('shows all licences and flags the expired one', (tester) async {
    final s = DrugLicenceSummary.fromJson({
      'licences': [
        _row('dl20b', 'Form 20B', 'TEST-20B-1', '2028-01-31', 'valid'),
        _row('dl21b', 'Form 21B', 'TEST-21B-1', '2026-09-30', 'expired'),
      ],
      'can_trade': false,
      'problems': ['Form 21B licence TEST-21B-1 expired on 2026-09-30'],
    });
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: LicenceSummaryView(summary: s))));
    expect(find.text('Form 20B'), findsOneWidget);
    expect(find.text('Form 21B'), findsOneWidget);
    expect(find.text('TEST-21B-1'), findsOneWidget);
    expect(find.text('Expired'), findsOneWidget);
    expect(find.text('Trade buying is paused'), findsOneWidget);
  });
}
