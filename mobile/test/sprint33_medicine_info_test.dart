import 'package:dawabag/models/medicine_info.dart';
import 'package:dawabag/screens/info/info_page_screen.dart';
import 'package:dawabag/screens/shop/widgets/medicine_info_view.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 33: approved medicine information as GET /medicines/:id/info sends it
// (empty sections already left out by the server). Made-up medicine.
Map<String, dynamic> _info() => {
      'available': true,
      'version': 2,
      'sections': {
        'overview': 'Zorvex relieves pain and fever.',
        'uses': ['Fever', 'Headache'],
        'side_effects': {'common': ['Nausea'], 'contact_doctor_if': ['You get a rash']},
        'safety': [
          {'topic': 'alcohol', 'label': 'Alcohol', 'level': 'unsafe', 'level_label': 'Unsafe', 'note': 'Avoid alcohol.'},
          {'topic': 'driving', 'label': 'Driving', 'level': 'safe', 'level_label': 'Safe', 'note': null},
        ],
        'facts': {'therapeutic_class': 'Analgesic', 'habit_forming': false},
        'references': [{'source': 'Manufacturer’s package insert', 'date': 'March 2026'}],
      },
      'reviewed': {'name': 'Test Pharmacist', 'reg_no': 'TEST-MSPC-1', 'reviewed_at': '2026-10-01T06:30:00.000Z'},
      'disclaimer': 'For information only. Follow your doctor’s advice.',
    };

void main() {
  test('reads the sections in page order and the review record', () {
    final i = MedicineInfo.fromJson(_info());
    expect(i.available, isTrue);
    expect(i.present.map((s) => s.label).toList(), ['Overview', 'Uses', 'Side effects', 'Safety advice', 'Fact box', 'References']);
    expect(i.reviewerRegNo, 'TEST-MSPC-1');
    expect(MedicineInfo.fromJson({'available': false}).present, isEmpty);
  });

  testWidgets('one accordion per section, empty ones absent, reviewed by and disclaimer shown', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: MedicineInfoView(info: MedicineInfo.fromJson(_info()))))));
    expect(find.text('About this medicine'), findsOneWidget);
    expect(find.byType(ExpansionTile), findsNWidgets(6));
    expect(find.text('How it works'), findsNothing);
    expect(find.text('Interactions'), findsNothing);
    // the first section is open
    expect(find.text('Zorvex relieves pain and fever.'), findsOneWidget);
    // others open on tap
    expect(find.text('Unsafe'), findsNothing);
    await tester.tap(find.text('Safety advice'));
    await tester.pumpAndSettle();
    expect(find.text('Unsafe'), findsOneWidget);
    expect(find.text('Avoid alcohol.'), findsOneWidget);
    await tester.tap(find.text('Fact box'));
    await tester.pumpAndSettle();
    expect(find.text('Habit forming'), findsOneWidget);
    expect(find.text('No'), findsOneWidget);
    expect(find.textContaining('Reviewed by Test Pharmacist, Reg. no. TEST-MSPC-1'), findsOneWidget);
    expect(find.text('For information only. Follow your doctor’s advice.'), findsOneWidget);
  });

  testWidgets('nothing shown when no approved information exists', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: MedicineInfoView(info: MedicineInfo(available: false)))));
    expect(find.text('About this medicine'), findsNothing);
  });

  testWidgets('trust page text: headings, list items and paragraphs, no markup', (tester) async {
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ListView(children: infoPageBlocks(
        '## Recalled batches\nA recalled batch is blocked.\nIt cannot be sold.\n\n- Damaged: within 48 hours\n- Recalled: any time\n<b>not bold</b>')))));
    expect(find.text('Recalled batches'), findsOneWidget);
    expect(find.text('A recalled batch is blocked. It cannot be sold.'), findsOneWidget);
    expect(find.text('•  Damaged: within 48 hours'), findsOneWidget);
    expect(find.text('<b>not bold</b>'), findsOneWidget);
  });
}
