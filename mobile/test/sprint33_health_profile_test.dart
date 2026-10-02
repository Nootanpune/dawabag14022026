import 'package:dawabag/models/health_profile.dart';
import 'package:dawabag/screens/account/health/health_profile_form.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 33: the health profile as GET /health-profile returns it. Made-up people.
HealthProfile _profile({bool consent = false}) => HealthProfile.fromJson({
      'consent': {'given': consent, 'purpose': 'I agree that Dawabag may keep the allergies … so that its pharmacists can see them.'},
      'allergies': consent ? ['Penicillin'] : [],
      'conditions': [],
      'current_medicines': [],
      'family_members': [
        {'id': 'm1', 'full_name': 'Asha', 'relationship': 'mother', 'age': 64, 'allergies': ['Aspirin'], 'conditions': []},
      ],
    });

void main() {
  test('reads consent, lists and family members', () {
    final p = _profile(consent: true);
    expect(p.consentGiven, isTrue);
    expect(p.allergies, ['Penicillin']);
    expect(p.family.single.subtitle, 'mother · 64 years');
    expect(splitEntries(' Penicillin,\nSulpha drugs\n\n'), ['Penicillin', 'Sulpha drugs']);
  });

  testWidgets('Save stays off until the consent box is ticked (never pre-ticked, C-41)', (tester) async {
    bool? sentConsent;
    List<String>? sentAllergies;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: HealthProfileForm(
      profile: _profile(),
      onSave: (consent, allergies, conditions, medicines) {
        sentConsent = consent;
        sentAllergies = allergies;
      },
    )))));
    final save = find.widgetWithText(FilledButton, 'Save');
    expect(tester.widget<FilledButton>(save).onPressed, isNull);
    expect(tester.widget<CheckboxListTile>(find.byKey(const ValueKey('health-consent'))).value, isFalse);
    await tester.enterText(find.widgetWithText(TextField, 'Allergies (one per line)'), 'Penicillin\nSulpha drugs');
    await tester.tap(find.byKey(const ValueKey('health-consent')));
    await tester.pump();
    await tester.tap(save);
    expect(sentConsent, isTrue);
    expect(sentAllergies, ['Penicillin', 'Sulpha drugs']);
  });

  testWidgets('after consent, no box and Save works straight away', (tester) async {
    bool? sentConsent = false;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: HealthProfileForm(
      profile: _profile(consent: true),
      onSave: (consent, a, c, m) => sentConsent = consent,
    )))));
    expect(find.byKey(const ValueKey('health-consent')), findsNothing);
    await tester.tap(find.widgetWithText(FilledButton, 'Save'));
    expect(sentConsent, isNull);   // consent is not sent again
  });
}
