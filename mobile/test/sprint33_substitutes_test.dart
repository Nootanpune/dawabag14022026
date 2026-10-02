import 'package:dawabag/models/product_page_extras.dart';
import 'package:dawabag/screens/shop/widgets/delivery_info_card.dart';
import 'package:dawabag/screens/shop/widgets/substitutes_section.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 33: substitutes as GET /medicines/:id/substitutes sends them. Made-up medicines.
Map<String, dynamic> _sub(String id, String name, int price, int perUnit, int? save, {bool inStock = true}) => {
      'id': id, 'name': name, 'drug_schedule': 'OTC', 'display_price_paise': price, 'min_order_qty': 1, 'in_stock': inStock,
      'net_quantity': '10 tablets', 'maker': 'Test Remedies', 'per_unit_paise': perUnit, 'unit_label': 'per tablet', 'save_pct': save,
    };

SubstitutesResult _result() => SubstitutesResult.fromJson({
      'product': {'id': 'cur', 'name': 'Zorvex 650 Tablet', 'per_unit_paise': 300, 'unit_label': 'per tablet'},
      'note': 'Same medicine, different maker. Ask your doctor or pharmacist before switching.',
      'consult_href': '/consult',
      'total': 3,
      'substitutes': [
        _sub('a', 'Calzor 650 Tablet', 1000, 100, 66, inStock: false),
        _sub('b', 'Zorvaquin 650 mg Tablet', 2000, 200, 33),
      ],
    });

void main() {
  test('reads prices per unit and the saving', () {
    final r = _result();
    expect(r.total, 3);
    expect(r.items.first.savePct, 66);
    expect(r.items.first.inStock, isFalse);
    expect(perUnitText(r.productPerUnitPaise, r.productUnitLabel), '₹3.00 per tablet');
    expect(const Substitute({'save_pct': null}).savePct, isNull);
  });

  testWidgets('lists substitutes with Save %, stock, the note and See all', (tester) async {
    await tester.pumpWidget(ProviderScope(
      child: MaterialApp(home: Scaffold(body: SingleChildScrollView(child: SubstitutesList(result: _result(), productId: 'cur', preview: true)))),
    ));
    expect(find.text('Substitutes'), findsOneWidget);
    expect(find.text('Calzor 650 Tablet'), findsOneWidget);
    expect(find.text('Save 66%'), findsOneWidget);
    expect(find.text('Save 33%'), findsOneWidget);
    expect(find.text('Out of stock'), findsOneWidget);       // the first one cannot be added
    expect(find.text('Add'), findsOneWidget);                // the second can
    expect(find.text('₹2.00 per tablet'), findsOneWidget);
    expect(find.text('See all 3 substitutes'), findsOneWidget);
    expect(find.text('Same medicine, different maker. Ask your doctor or pharmacist before switching.'), findsOneWidget);
    expect(find.text('Consult a doctor'), findsOneWidget);
  });

  testWidgets('expiry and cold-chain lines come from the product data', (tester) async {
    await tester.pumpWidget(const ProviderScope(
      child: MaterialApp(home: Scaffold(body: DeliveryInfoCard(product: {
        'id': 'p1', 'in_stock': false, 'expires_on_or_after': 'Mar 2028',
        'cold_chain_note': 'Delivered in an insulated pack. Keep refrigerated on arrival.',
      }))),
    ));
    expect(find.text('Expires on or after Mar 2028'), findsOneWidget);
    expect(find.text('Delivered in an insulated pack. Keep refrigerated on arrival.'), findsOneWidget);
  });
}
