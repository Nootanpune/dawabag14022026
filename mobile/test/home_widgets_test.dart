import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/screens/shop/widgets/info_row.dart';
import 'package:dawabag/utils/category_icon.dart';
import 'package:dawabag/widgets/home/category_tiles.dart';
import 'package:dawabag/widgets/home/prescription_cta.dart';
import 'package:dawabag/widgets/home/trust_strip.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: SingleChildScrollView(child: child)));

void main() {
  testWidgets('trust strip shows the three badges', (tester) async {
    await tester.pumpWidget(_wrap(const TrustStrip()));
    expect(find.text('Licensed pharmacy'), findsOneWidget);
    expect(find.text('Pharmacist-checked'), findsOneWidget);
    expect(find.text('Genuine stock'), findsOneWidget);
  });

  testWidgets('prescription CTA button calls back', (tester) async {
    var tapped = false;
    await tester.pumpWidget(_wrap(PrescriptionCta(onUpload: () => tapped = true)));
    expect(find.text('Have a prescription?'), findsOneWidget);
    await tester.tap(find.text('Upload prescription'));
    expect(tapped, isTrue);
  });

  testWidgets('category tiles select a category and All clears it', (tester) async {
    String? picked;
    await tester.pumpWidget(_wrap(CategoryTiles(
      categories: const ['Pain relief', 'Vitamins'],
      selected: 'Vitamins',
      onSelected: (c) => picked = c,
    )));
    await tester.tap(find.text('Pain relief'));
    expect(picked, 'Pain relief');
    await tester.tap(find.text('All'));
    expect(picked, '');
  });

  test('category icons fall back to a generic icon', () {
    expect(categoryIcon('Pain relief'), Icons.healing_outlined);
    expect(categoryIcon('Something new'), Icons.medication_outlined);
    expect(categoryIcon(null), Icons.medication_outlined);
  });

  testWidgets('info rows and sections hide empty values', (tester) async {
    await tester.pumpWidget(_wrap(const Column(children: [
      InfoSection(title: 'Product declarations', rows: [
        InfoRow('Net quantity', '10 tablets'),
        InfoRow('Country of origin', ''),
        InfoRow('Manufacturer', null),
      ]),
      InfoSection(title: 'Empty section', rows: [InfoRow('A', null), InfoRow('B', '  ')]),
    ])));
    expect(find.text('10 tablets'), findsOneWidget);
    expect(find.text('Country of origin'), findsNothing);
    expect(find.text('Manufacturer'), findsNothing);
    expect(find.text('—'), findsNothing);
    expect(find.text('Empty section'), findsNothing);
  });
}
