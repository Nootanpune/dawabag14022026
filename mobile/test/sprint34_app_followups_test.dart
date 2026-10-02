import 'package:dawabag/models/trade_prices.dart';
import 'package:dawabag/providers/catalog_provider.dart';
import 'package:dawabag/providers/trade_price_provider.dart';
import 'package:dawabag/providers/typeahead_provider.dart';
import 'package:dawabag/screens/account/licences/licence_copy_picker.dart';
import 'package:dawabag/screens/account/licences/licence_renewal_form.dart';
import 'package:dawabag/screens/checkout/widgets/confirmed_step.dart';
import 'package:dawabag/screens/search/search_screen.dart';
import 'package:dawabag/widgets/trade_price_banner.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

// Sprint 34 — app follow-ups: paused trade prices banner, the prescription line on
// the order confirmation, PDF licence copies, and the Search tab's 250 ms wait.
// Made-up numbers.

const _pause = TradePause(form: 'dl20b', label: 'Form 20B', licenceNumber: 'TEST-MH-1', expiredOn: '2026-10-01');

void main() {
  group('trade prices paused (C-14)', () {
    test('reads GET /users/me/trade-prices and says it in the web’s words', () {
      final t = TradePrices.fromJson({
        'pricing_type': 'customer',
        'paused': true,
        'licence': {'form': 'dl20b', 'label': 'Form 20B', 'licence_number': 'TEST-MH-1', 'expired_on': '2026-10-01'},
      });
      expect(t.showBanner, isTrue);
      expect(tradePauseText(t.licence!),
          'Your drug licence Form 20B TEST-MH-1 expired on 01 Oct 2026 — trade prices are paused until a renewal is checked');
      expect(TradePrices.fromJson({'pricing_type': 'b2b_retailer', 'paused': false, 'licence': null}).showBanner, isFalse);
      expect(isTradeBuyer('b2b_retailer'), isTrue);
      expect(isTradeBuyer('b2b_wholesaler'), isTrue);
      expect(isTradeBuyer('customer'), isFalse);
      expect(isTradeBuyer('doc_hospital'), isFalse);
    });

    Future<void> pumpBanner(WidgetTester tester, TradePrices? status) async {
      final router = GoRouter(routes: [
        GoRoute(path: '/', builder: (_, __) => const Scaffold(body: TradePriceBanner())),
        GoRoute(path: '/account/licences', builder: (_, __) => const Text('Your drug licences')),
      ]);
      await tester.pumpWidget(ProviderScope(
        overrides: [tradePricesProvider.overrideWith((ref) async => status)],
        child: MaterialApp.router(routerConfig: router),
      ));
      await tester.pumpAndSettle();
    }

    testWidgets('banner shows when paused and links to Your drug licences', (tester) async {
      await pumpBanner(tester, const TradePrices(pricingType: 'customer', paused: true, licence: _pause));
      expect(find.byKey(const ValueKey('trade-price-banner')), findsOneWidget);
      expect(find.textContaining('Form 20B TEST-MH-1 expired on 01 Oct 2026'), findsOneWidget);
      await tester.tap(find.text('Send the renewed licence'));
      await tester.pumpAndSettle();
      expect(find.text('Your drug licences'), findsOneWidget);
    });

    testWidgets('no banner when not paused or not a trade account', (tester) async {
      await pumpBanner(tester, const TradePrices(pricingType: 'b2b_retailer', paused: false));
      expect(find.byKey(const ValueKey('trade-price-banner')), findsNothing);
      await pumpBanner(tester, null);
      expect(find.byKey(const ValueKey('trade-price-banner')), findsNothing);
    });
  });

  group('order confirmed', () {
    testWidgets('repeats the prescription line like the web', (tester) async {
      await tester.pumpWidget(const MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: ConfirmedStep(orderNumber: 'DB-TEST-1', prescriptionLabel: 'photo uploaded 02 Oct 2026, 9:56 AM'),
          ),
        ),
      ));
      expect(find.text('Order placed and paid'), findsOneWidget);
      expect(find.text('Prescription (photo uploaded 02 Oct 2026, 9:56 AM) ✓ — our pharmacist checks it before dispatch.'),
          findsOneWidget);
      expect(find.textContaining('Next: our pharmacist checks your prescription'), findsOneWidget);
    });

    testWidgets('no prescription line when none was needed', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: SingleChildScrollView(child: ConfirmedStep(orderNumber: 'DB-TEST-2')))));
      expect(find.text('Order confirmed!'), findsOneWidget);
      expect(find.textContaining('Prescription ('), findsNothing);
    });
  });

  group('licence copy: photo or PDF', () {
    test('PDF, JPG or PNG up to 5 MB, as the server', () {
      expect(licenceCopyProblem(const LicenceCopy(path: '/x/l.pdf', name: 'l.pdf', size: 1000)), isNull);
      expect(licenceCopyProblem(const LicenceCopy(path: '/x/l.PNG', name: 'l.PNG', size: 1000)), isNull);
      expect(licenceCopyProblem(const LicenceCopy(path: '/x/l.heic', name: 'l.heic', size: 1000)), 'Choose a PDF, JPG or PNG file.');
      expect(licenceCopyProblem(const LicenceCopy(path: '/x/l.pdf', name: 'l.pdf', size: 6 * 1024 * 1024)),
          'This PDF is larger than 5 MB. Please choose a smaller file.');
      expect(const LicenceCopy(path: '/x/l.pdf', name: 'l.pdf', size: 1).label, 'PDF: l.pdf');
      expect(const LicenceCopy(path: '/x/l.jpg', name: 'l.jpg', size: 1).label, 'Photo: l.jpg');
    });

    testWidgets('renewal form sends a chosen PDF; a too-large one is refused in words', (tester) async {
      LicenceCopy? sent;
      var next = const LicenceCopy(path: '/tmp/big.pdf', name: 'big.pdf', size: 6 * 1024 * 1024);
      await tester.pumpWidget(MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: LicenceRenewalForm(
              customerType: 'b2b_retailer',
              today: '2026-10-02',
              pickCopy: () async => next,
              onSubmit: (d, copy) async {
                sent = copy;
                return null;
              },
            ),
          ),
        ),
      ));
      expect(find.text('PDF, JPG or PNG, up to 5 MB. Only you and Dawabag’s team can open it.'), findsOneWidget);
      await tester.ensureVisible(find.text('Add a photo or PDF of the licence (optional)'));
      await tester.tap(find.text('Add a photo or PDF of the licence (optional)'));
      await tester.pumpAndSettle();
      expect(find.text('• This PDF is larger than 5 MB. Please choose a smaller file.'), findsOneWidget);

      next = const LicenceCopy(path: '/tmp/licence.pdf', name: 'licence.pdf', size: 2048);
      await tester.tap(find.text('Add a photo or PDF of the licence (optional)'));
      await tester.pumpAndSettle();
      expect(find.text('PDF: licence.pdf'), findsOneWidget);

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
      expect(sent?.name, 'licence.pdf');
      expect(sent?.isPdf, isTrue);
    });
  });

  group('Search tab', () {
    testWidgets('waits 250 ms after typing, like the home search box', (tester) async {
      final asked = <String>[];
      await tester.pumpWidget(ProviderScope(
        overrides: [
          browsePincodeProvider.overrideWithValue(''),
          tradePricesProvider.overrideWith((ref) async => null),
          productsProvider.overrideWith((ref, key) async {
            asked.add(Uri.splitQueryString(key)['q'] ?? '');
            return {'products': const <Map<String, dynamic>>[], 'pagination': {'total': 0}};
          }),
          searchSuggestionsProvider.overrideWith((ref, q) async => const <String>[]),
        ],
        child: const MaterialApp(home: SearchScreen()),
      ));
      expect(kTypeaheadDebounce, const Duration(milliseconds: 250));
      await tester.enterText(find.byType(TextField), 'amox');
      await tester.pump(const Duration(milliseconds: 200));
      expect(asked, isEmpty, reason: 'nothing asked before 250 ms');
      await tester.pump(const Duration(milliseconds: 60));
      await tester.pump();
      expect(asked, ['amox']);
    });
  });
}
