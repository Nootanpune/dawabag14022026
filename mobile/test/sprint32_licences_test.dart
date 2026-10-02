import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image_picker/image_picker.dart';
import 'package:dawabag/models/drug_licence.dart';
import 'package:dawabag/models/licence_draft.dart';
import 'package:dawabag/screens/account/licences/licence_renewal_form.dart';
import 'package:dawabag/screens/account/licences/licences_screen.dart';

// Sprint 32: send a renewed or another drug licence from the app (POST
// /users/me/licences, then the optional photo). Made-up numbers.

void main() {
  group('licence draft (mirror of the web\'s forms.ts)', () {
    test('plain checks before sending', () {
      const today = '2026-10-02';
      expect(licenceDraftProblems(const LicenceDraft(), today), ['Enter the licence']);
      expect(licenceDraftProblems(const LicenceDraft(number: 'TEST-1'), today), ['Choose the licence form']);
      expect(licenceDraftProblems(const LicenceDraft(form: 'dl20b', number: 'X'), today),
          ['Form 20B: enter the licence number', 'Form 20B: enter the valid-till date']);
      expect(licenceDraftProblems(const LicenceDraft(form: 'dl21b', number: 'TEST-21B', validUpto: '2026-09-30'), today),
          ['Form 21B expired on 2026-09-30 — enter the renewed licence']);
      expect(licenceDraftProblems(const LicenceDraft(form: 'other', number: 'TEST-9', validUpto: '2030-01-01'), today),
          ['Type the name of the licence form']);
      expect(licenceDraftProblems(const LicenceDraft(form: 'dl20', number: 'TEST-20', validUpto: '2031-03-31'), today), isEmpty);
    });

    test('the body the server takes', () {
      const d = LicenceDraft(form: 'dl20', number: ' TEST-20 ', validUpto: '2031-03-31');
      expect(d.toBody(), {
        'form': 'dl20',
        'form_name': null,
        'licence_number': 'TEST-20',
        'issued_by': null,
        'valid_from': null,
        'valid_upto': '2031-03-31',
      });
      expect(licenceFormsFor('b2b_wholesaler').first.label, 'Form 20B');
      expect(licenceFormsFor('b2b_retailer').take(2).map((f) => f.label), ['Form 20', 'Form 21']);
      expect(licenceFormsFor('b2b_retailer').length, kLicenceForms.length);
    });
  });

  testWidgets('renewal form: form, number, valid till and an optional photo are sent', (tester) async {
    LicenceDraft? sent;
    XFile? sentPhoto;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: LicenceRenewalForm(
            customerType: 'b2b_wholesaler',
            today: '2026-10-02',
            pickPhoto: () async => XFile.fromData(Uint8List.fromList([1, 2, 3]), path: 'licence.jpg'),
            onSubmit: (d, photo) async {
              sent = d;
              sentPhoto = photo;
              return null;
            },
          ),
        ),
      ),
    ));

    await tester.ensureVisible(find.text('Send for checking'));
    await tester.tap(find.text('Send for checking'));
    await tester.pump();
    expect(find.text('• Enter the licence'), findsOneWidget);
    expect(sent, isNull);

    await tester.tap(find.byKey(const ValueKey('licence-form')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Form 21B — Wholesale — Schedule C / C1 medicines').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('licence-number')), 'TEST-21B-9');

    await tester.ensureVisible(find.text('Choose the valid-till date'));
    await tester.tap(find.text('Choose the valid-till date'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    expect(find.text('Valid till 02 Oct 2027'), findsOneWidget);

    await tester.ensureVisible(find.text('Add a photo of the licence (optional)'));
    await tester.tap(find.text('Add a photo of the licence (optional)'));
    await tester.pumpAndSettle();
    expect(find.text('Photo: licence.jpg'), findsOneWidget);

    await tester.ensureVisible(find.text('Send for checking'));
    await tester.tap(find.text('Send for checking'));
    await tester.pumpAndSettle();
    expect(sent?.toBody()['form'], 'dl21b');
    expect(sent?.toBody()['licence_number'], 'TEST-21B-9');
    expect(sent?.toBody()['valid_upto'], '2027-10-02');
    expect(sentPhoto?.name, 'licence.jpg');
  });

  testWidgets('the server\'s refusal is shown', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: SingleChildScrollView(
          child: LicenceRenewalForm(
            customerType: 'b2b_retailer',
            today: '2026-10-02',
            pickPhoto: () async => null,
            onSubmit: (_, __) async => 'This licence number is already registered to another business',
          ),
        ),
      ),
    ));
    await tester.tap(find.byKey(const ValueKey('licence-form')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Form 20 — Retail sale').last);
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('licence-number')), 'TEST-20-1');
    await tester.ensureVisible(find.text('Choose the valid-till date'));
    await tester.tap(find.text('Choose the valid-till date'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('OK'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Send for checking'));
    await tester.tap(find.text('Send for checking'));
    await tester.pumpAndSettle();
    expect(find.text('• This licence number is already registered to another business'), findsOneWidget);
  });

  testWidgets('the list offers Send and, on a licence waiting for the check, Upload copy', (tester) async {
    final s = DrugLicenceSummary.fromJson({
      'licences': [
        {'id': 'a', 'form': 'dl20', 'label': 'Form 20', 'licence_number': 'TEST-20-1', 'valid_upto': '2028-01-31', 'status': 'verified', 'validity': 'valid', 'has_document': true},
        {'id': 'b', 'form': 'dl21', 'label': 'Form 21', 'licence_number': 'TEST-21-2', 'valid_upto': '2031-09-30', 'status': 'pending', 'validity': 'valid'},
      ],
    });
    var sends = 0;
    final uploads = <String?>[];
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(body: LicenceSummaryView(summary: s, onSend: () => sends++, onUploadCopy: (l) => uploads.add(l.id))),
    ));
    expect(find.text('Copy on file'), findsOneWidget);
    expect(find.text('Upload copy'), findsOneWidget); // only the pending one
    await tester.tap(find.text('Upload copy'));
    await tester.tap(find.text('Send a renewed or another licence'));
    expect(uploads, ['b']);
    expect(sends, 1);
  });
}
