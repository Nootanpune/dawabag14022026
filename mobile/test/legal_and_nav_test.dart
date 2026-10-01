import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/models/legal_info.dart';
import 'package:dawabag/providers/legal_provider.dart';
import 'package:dawabag/widgets/legal/legal_summary_tile.dart';
import 'package:dawabag/widgets/main_scaffold.dart';

void main() {
  testWidgets('legal tile is compact until opened, then shows C-04/C-36 details', (tester) async {
    var fetched = 0;
    await tester.pumpWidget(ProviderScope(
      overrides: [
        legalInfoProvider.overrideWith((ref) async {
          fetched++;
          return LegalInfo.fromJson({
            'entity': {'name': 'Dawabag Pvt Ltd'},
            'drug_licences': {'retail_20': 'MH-20-123', 'retail_21': 'MH-21-456', 'valid_upto': ''},
            'pharmacist_in_charge': {'name': 'A. Pharmacist', 'registration_no': 'R-99'},
            'grievance_officer': {'name': 'G. Officer', 'email': 'grievance@example.in', 'phone': ''},
          });
        }),
      ],
      child: const MaterialApp(home: Scaffold(body: LegalSummaryTile())),
    ));
    expect(find.text('Licences, pharmacist & grievance officer'), findsOneWidget);
    expect(fetched, 0, reason: 'details load only when opened');

    await tester.tap(find.text('Licences, pharmacist & grievance officer'));
    await tester.pumpAndSettle();
    expect(fetched, 1);
    expect(find.textContaining('MH-20-123, MH-21-456'), findsOneWidget);
    expect(find.textContaining('A. Pharmacist · Reg. no. R-99'), findsOneWidget);
    expect(find.textContaining('G. Officer · grievance@example.in'), findsOneWidget);
    expect(find.text('Full details, complaints & policies'), findsOneWidget);
  });

  test('bottom navigation index follows the location', () {
    expect(MainScaffold.indexFor('/'), 0);
    expect(MainScaffold.indexFor('/search'), 1);
    expect(MainScaffold.indexFor('/orders'), 2);
    expect(MainScaffold.indexFor('/account'), 3);
  });
}
