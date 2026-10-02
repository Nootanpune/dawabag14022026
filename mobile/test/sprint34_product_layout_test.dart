import 'package:dawabag/models/medicine_info.dart';
import 'package:dawabag/models/product_page_extras.dart';
import 'package:dawabag/models/trade_prices.dart';
import 'package:dawabag/providers/product_page_providers.dart';
import 'package:dawabag/providers/trade_price_provider.dart';
import 'package:dawabag/screens/shop/product_detail_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

// Sprint 34: the product page (Sprint 33 blocks) on a small phone — 360 dp wide
// with the system text size at 130 % — and long content must not overflow.
// Golden-free: any RenderFlex overflow fails the test. Made-up medicine.

const _long = 'Zorvexamolide Hydrochloride Extended Release 1000 mg Film Coated Tablet (strip of fifteen tablets)';

Map<String, dynamic> _product() => {
      'id': 'p1',
      'name': _long,
      'marketed_by': 'Test Remedies Pharmaceutical Laboratories Private Limited, Unit II',
      'drug_schedule': 'Schedule H1',
      'cold_chain': true,
      'in_stock': true,
      'offer_price_paise': 1234500,
      'mrp_paise': 1500000,
      'discount_pct': 17,
      'min_order_qty': 1,
      'max_order_qty': 10,
      'expires_on_or_after': 'September 2027',
      'cold_chain_note': 'Delivered in an insulated pack with ice gel. Keep refrigerated between 2 °C and 8 °C on arrival.',
      'description': 'A long approved description. ' * 6,
      'generic_name': 'Zorvexamolide Hydrochloride',
      'composition': 'Zorvexamolide Hydrochloride IP 1000 mg, Excipients q.s., Colour: Titanium Dioxide IP',
      'category': 'Pain relief and anti-inflammatory medicines',
      'sku': 'TEST-SKU-0000000000001',
      'net_quantity': '15 tablets',
      'manufacturer_name': 'Test Remedies Pharmaceutical Laboratories Private Limited',
      'manufacturer_address': 'Plot 123456, Industrial Development Area Phase III, Very Long Road Name, Baddi, Himachal Pradesh 173205',
      'country_of_origin': 'India',
      'supplied_batch_expiry': 'Sep 2027',
      'storage_instructions': 'Store below 8 °C. Do not freeze. Protect from light and moisture. Keep out of reach of children.',
    };

MedicineInfo _info() => MedicineInfo.fromJson({
      'available': true,
      'version': 3,
      'sections': {
        'overview': 'Zorvexamolide relieves pain, swelling and fever. ' * 4,
        'uses': ['Pain after an operation or an injury that lasts for several days', 'Fever'],
        'how_to_use': 'Take it with food. Swallow the tablet whole with a full glass of water; do not chew or crush it.',
        'side_effects': {
          'common': ['Nausea', 'Heartburn and indigestion after meals'],
          'serious': ['Black or tarry stools'],
          'contact_doctor_if': ['You get a rash, swelling of the face or difficulty in breathing'],
        },
        'safety': [
          {'topic': 'alcohol', 'label': 'Alcohol', 'level': 'unsafe', 'level_label': 'Unsafe', 'note': 'Avoid alcohol while taking this medicine.'},
          {'topic': 'pregnancy', 'label': 'Pregnancy', 'level': 'consult_doctor', 'level_label': 'Consult your doctor', 'note': 'Ask your doctor before using it during pregnancy.'},
          {'topic': 'breast_feeding', 'label': 'Breast-feeding', 'level': 'not_known', 'level_label': 'Not known', 'note': null},
          {'topic': 'driving', 'label': 'Driving', 'level': 'caution', 'level_label': 'Caution', 'note': 'It may make you feel dizzy.'},
        ],
        'interactions': {
          'medicines': ['Blood thinners such as warfarin'],
          'food': ['Grapefruit juice'],
          'conditions': ['Kidney disease', 'Stomach ulcers'],
        },
        'facts': {
          'therapeutic_class': 'Non-steroidal anti-inflammatory drugs (NSAIDs)',
          'chemical_class': 'Propionic acid derivative',
          'action_class': 'Cyclo-oxygenase inhibitor',
          'habit_forming': false,
        },
        'faqs': [
          {'question': 'Can I take Zorvexamolide on an empty stomach for a quick effect?', 'answer': 'No. Take it with food to protect your stomach.'},
        ],
        'references': [{'source': 'Manufacturer’s package insert, Test Remedies Pharmaceutical Laboratories', 'date': 'March 2026'}],
      },
      'reviewed': {'name': 'Test Pharmacist With A Long Name', 'reg_no': 'TEST-MSPC-0000012345', 'reviewed_at': '2026-10-01T06:30:00.000Z'},
      'disclaimer': 'For information only. Follow your doctor’s advice.',
    });

SubstitutesResult _subs() => SubstitutesResult.fromJson({
      'product': {'id': 'p1', 'name': _long, 'per_unit_paise': 82300, 'unit_label': 'per tablet'},
      'note': kSubstituteNote,
      'total': 7,
      'substitutes': [
        for (var i = 0; i < 3; i++)
          {
            'id': 's$i', 'name': 'Zorvexamolide Hydrochloride ER 1000 mg Tablet from maker number $i',
            'drug_schedule': 'Schedule H1', 'display_price_paise': 999900, 'min_order_qty': 1, 'in_stock': i != 1,
            'net_quantity': '15 tablets', 'maker': 'Another Very Long Pharmaceutical Company Name Limited',
            'per_unit_paise': 66660, 'unit_label': 'per tablet', 'save_pct': 19,
          },
      ],
    });

/// The app's button sizes (AppTheme.light) without its downloaded fonts:
/// full-width minimum buttons are what break rows on a real phone.
ThemeData _appLikeTheme() => ThemeData(
      useMaterial3: true,
      elevatedButtonTheme: ElevatedButtonThemeData(style: ElevatedButton.styleFrom(minimumSize: const Size(double.infinity, 48))),
      outlinedButtonTheme: OutlinedButtonThemeData(style: OutlinedButton.styleFrom(minimumSize: const Size(double.infinity, 48))),
    );

Future<void> _pumpPage(WidgetTester tester, {required DeliveryEstimate delivery}) async {
  tester.view.physicalSize = const Size(360 * 3, 760 * 3);
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      productDetailProvider('p1').overrideWith((ref) async => _product()),
      medicineInfoProvider('p1').overrideWith((ref) async => _info()),
      substitutesProvider(('p1', 3)).overrideWith((ref) async => _subs()),
      deliveryEstimateProvider(('p1', '')).overrideWith((ref) async => delivery),
      tradePricesProvider.overrideWith((ref) async => const TradePrices(
            pricingType: 'customer',
            paused: true,
            licence: TradePause(form: 'dl20b', label: 'Form 20B', licenceNumber: 'TEST-MH-PUNE-000000123456', expiredOn: '2026-10-01'),
          )),
    ],
    child: MaterialApp(
      theme: _appLikeTheme(),
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(textScaler: const TextScaler.linear(1.3)),
        child: child!,
      ),
      home: const ProductDetailScreen(productId: 'p1'),
    ),
  ));
  await tester.pumpAndSettle();
}

/// Opens every accordion once and scrolls to the end, checking for overflow on
/// the way. Returns how many accordions were opened.
Future<int> _walkPage(WidgetTester tester) async {
  final list = find.byType(Scrollable).first;
  final opened = <Key>{};
  for (var i = 0; i < 40; i++) {
    for (final e in find.byType(ExpansionTile).evaluate().toList()) {
      final tile = e.widget as ExpansionTile;
      if (tile.initiallyExpanded || tile.key == null || opened.contains(tile.key)) continue;
      final title = find.descendant(of: find.byKey(tile.key!), matching: find.byType(ListTile)).first;
      final rect = tester.getRect(title);
      if (rect.top < 80 || rect.bottom > 560) continue;
      await tester.tap(title);
      await tester.pumpAndSettle();
      opened.add(tile.key!);
      expect(tester.takeException(), isNull);
    }
    await tester.drag(list, const Offset(0, -250));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  }
  return opened.length;
}

void main() {
  testWidgets('product page at 360 dp and 130 % text: long content, every section open, no overflow', (tester) async {
    await _pumpPage(tester,
        delivery: const DeliveryEstimate(
            pincode: '411001', serviceable: true, city: 'Pune Cantonment Board Area (Camp)', label: 'Get it by Wednesday, 7 October 2026'));
    expect(tester.takeException(), isNull);
    expect(find.byKey(const ValueKey('trade-price-banner')), findsOneWidget);
    expect(find.byKey(const ValueKey('delivery-eta')), findsOneWidget);
    // 9 sections; the first is open already
    expect(await _walkPage(tester), 8);
    // the last blocks were reached and laid out
    expect(find.text('Product declarations'), findsOneWidget);
    expect(find.textContaining('Reviewed by Test Pharmacist With A Long Name'), findsOneWidget);
  });

  testWidgets('product page asks for a PIN without overflow on a small phone', (tester) async {
    await _pumpPage(tester, delivery: const DeliveryEstimate(needsPincode: true));
    expect(find.text('PIN code for the delivery date'), findsOneWidget);
    expect(find.text('Check'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
