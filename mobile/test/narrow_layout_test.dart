import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/widgets/home/consult_doctor_tile.dart';
import 'package:dawabag/widgets/home/prescription_cta.dart';
import 'package:dawabag/widgets/home/search_entry.dart';
import 'package:dawabag/widgets/home/trust_strip.dart';
import 'package:dawabag/widgets/product_card.dart';

// Home pieces must fit a small (320 dp) phone without overflow.
void main() {
  testWidgets('home widgets fit a 320 dp wide screen', (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: ListView(padding: const EdgeInsets.all(16), children: [
          SearchEntry(onTap: () {}),
          const TrustStrip(),
          PrescriptionCta(onUpload: () {}),
          ConsultDoctorTile(onTap: () {}),
        ]),
      ),
    ));
    expect(tester.takeException(), isNull);
  });

  testWidgets('product card fits a grid tile on a 320 dp screen', (tester) async {
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Center(
          child: SizedBox(
            width: 138, // (320 - 2 * 16 - 12) / 2
            height: 268, // ProductGrid tile height
            child: ProductCard(
              product: const {
                'name': 'Dolo 650 Tablet strip of fifteen',
                'marketed_by': 'Micro Labs Ltd',
                'drug_schedule': 'Schedule H',
                'in_stock': true,
                'offer_price_paise': 3000,
                'discount_pct': 10,
              },
              onAddToCart: (_) {},
              onTap: () {},
            ),
          ),
        ),
      ),
    ));
    expect(tester.takeException(), isNull);
  });
}
