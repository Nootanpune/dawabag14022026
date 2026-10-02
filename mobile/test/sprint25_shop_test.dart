import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/providers/catalog_provider.dart';
import 'package:dawabag/providers/prescription_provider.dart';
import 'package:dawabag/screens/cart/widgets/cart_prescription_notice.dart';
import 'package:dawabag/screens/prescriptions/widgets/after_upload_card.dart';
import 'package:dawabag/screens/prescriptions/widgets/prescription_tile.dart';
import 'package:dawabag/screens/prescriptions/widgets/prescription_upload_card.dart';
import 'package:dawabag/screens/search/widgets/no_results_view.dart';
import 'package:dawabag/screens/search/widgets/search_sort_bar.dart';
import 'package:dawabag/utils/prescription_status.dart';
import 'package:dawabag/widgets/home/search_entry.dart';

Widget _wrap(Widget child, {List<Override> overrides = const []}) => ProviderScope(
      overrides: overrides,
      child: MaterialApp(home: Scaffold(body: SizedBox(height: 900, child: child))),
    );

Map<String, dynamic> _rx(String status, {String? orderId, String? validUntil}) => {
      'id': 'rx-$status', 'status': status, 'order_id': orderId, 'valid_until': validUntil,
      'created_at': '2026-10-01T05:00:00Z', 'file_type': 'png', 'is_digital': false,
    };

void main() {
  group('prescription status', () {
    test('an upload with no order can be chosen at checkout', () {
      expect(isAttachablePrescription(_rx('pending')), isTrue);
      expect(isUsableAtCheckout(_rx('pending')), isTrue);
      expect(prescriptionStatus(_rx('pending')).label, 'Uploaded — not checked yet');
    });
    test('one already with an order, rejected or expired cannot', () {
      expect(isUsableAtCheckout(_rx('pending', orderId: 'o1')), isFalse);
      expect(prescriptionStatus(_rx('pending', orderId: 'o1')).label, 'Waiting for our pharmacist');
      expect(isUsableAtCheckout(_rx('rejected')), isFalse);
      expect(isUsableAtCheckout(_rx('expired')), isFalse);
      expect(isUsableAtCheckout(_rx('verified', validUntil: '2020-01-01')), isFalse);
      expect(isUsableAtCheckout(_rx('verified', validUntil: '2099-12-31')), isTrue);
    });
    test('a rejection shows the pharmacist\'s reason', () {
      expect(prescriptionStatus({..._rx('rejected'), 'rejection_reason': 'Date not visible'}).hint, 'Date not visible');
    });
  });

  test('search hints name generic medicines, not brands', () {
    expect(SearchEntry.hint, contains('paracetamol'));
    expect(SearchEntry.hint.toLowerCase(), isNot(contains('dolo')));
  });

  testWidgets('prescription tile shows the status and View', (tester) async {
    var viewed = false;
    await tester.pumpWidget(_wrap(PrescriptionTile(rx: _rx('pending'), onView: () => viewed = true)));
    expect(find.text('Prescription (PNG)'), findsOneWidget);
    expect(find.text('Uploaded — not checked yet'), findsOneWidget);
    await tester.tap(find.text('View'));
    expect(viewed, isTrue);
  });

  testWidgets('upload card offers a photo and a PDF, and locks while uploading', (tester) async {
    var photo = 0, pdf = 0;
    await tester.pumpWidget(_wrap(PrescriptionUploadCard(busy: false, onPhoto: () => photo++, onPdf: () => pdf++)));
    await tester.tap(find.text('Take or choose a photo'));
    await tester.tap(find.text('Choose a PDF'));
    expect((photo, pdf), (1, 1));
    await tester.pumpWidget(_wrap(PrescriptionUploadCard(busy: true, onPhoto: () => photo++, onPdf: () => pdf++)));
    expect(find.text('Uploading…'), findsOneWidget);
    await tester.tap(find.text('Choose a PDF'));
    expect(pdf, 1);
  });

  testWidgets('after an upload the buyer is sent to find the medicines', (tester) async {
    var tapped = false;
    await tester.pumpWidget(_wrap(AfterUploadCard(onFindMedicines: () => tapped = true)));
    expect(find.text('Now add the medicines from your prescription to your cart.'), findsOneWidget);
    await tester.tap(find.text('Find my medicines'));
    expect(tapped, isTrue);
  });

  testWidgets('sort bar picks a price order', (tester) async {
    String? picked;
    await tester.pumpWidget(_wrap(SearchSortBar(value: 'relevance', onChanged: (s) => picked = s)));
    await tester.tap(find.text('Price: low to high'));
    expect(picked, 'price_asc');
  });

  testWidgets('no results: says so, offers "Did you mean" and the upload', (tester) async {
    String? used;
    await tester.pumpWidget(_wrap(
      NoResultsView(query: 'paracitamool', onSuggestion: (s) => used = s),
      overrides: [searchSuggestionsProvider('paracitamool').overrideWith((_) async => ['Paracetamol'])],
    ));
    await tester.pumpAndSettle();
    expect(find.text('No medicines found for "paracitamool"'), findsOneWidget);
    expect(find.text('Upload a prescription instead'), findsOneWidget);
    await tester.tap(find.text('Paracetamol'));
    expect(used, 'Paracetamol');
  });

  testWidgets('cart notice: says a prescription is ready, or offers Upload now', (tester) async {
    await tester.pumpWidget(_wrap(const CartPrescriptionNotice(),
        overrides: [myPrescriptionsProvider.overrideWith((_) async => [_rx('pending')])]));
    await tester.pumpAndSettle();
    expect(find.textContaining('You have 1 uploaded prescription'), findsOneWidget);
    await tester.pumpWidget(ProviderScope(
      key: UniqueKey(),
      overrides: [myPrescriptionsProvider.overrideWith((_) async => [_rx('rejected')])],
      child: const MaterialApp(home: Scaffold(body: CartPrescriptionNotice())),
    ));
    await tester.pumpAndSettle();
    expect(find.text('Upload now'), findsOneWidget);
  });
}
