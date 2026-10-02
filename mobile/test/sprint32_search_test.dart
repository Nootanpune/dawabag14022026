import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/providers/catalog_provider.dart';
import 'package:dawabag/providers/typeahead_provider.dart';
import 'package:dawabag/utils/drug_schedule.dart';
import 'package:dawabag/widgets/home/home_search_box.dart';
import 'package:dawabag/widgets/schedule_badge.dart';

// Sprint 32: the home search box shows the server's matches as you type (as the web).
// Made-up products; the server answers are stubbed through the providers.
const _amox = {
  'id': 'p1',
  'name': 'Amoxicillin 500 mg Capsule',
  'generic_name': 'Amoxicillin',
  'drug_schedule': 'Schedule H',
  'display_price_paise': 8450,
  'in_stock': true,
};
const _para = {
  'id': 'p2',
  'name': 'Paracetamol 650 mg Tablet',
  'generic_name': 'Paracetamol',
  'drug_schedule': 'Non-scheduled',
  'display_price_paise': 3000,
  'in_stock': false,
};

void main() {
  late List<String> asked;
  late List<String> submitted;
  late List<String> opened;

  Future<void> pump(WidgetTester tester, {List<Map<String, dynamic>> products = const [_amox, _para], List<String> suggestions = const []}) async {
    asked = [];
    submitted = [];
    opened = [];
    await tester.pumpWidget(ProviderScope(
      overrides: [
        typeaheadProvider.overrideWith((ref, key) async {
          asked.add(Uri.splitQueryString(key)['q'] ?? '');
          return TypeaheadResult(products: products, total: products.length);
        }),
        searchSuggestionsProvider.overrideWith((ref, q) async => suggestions),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(children: [
              HomeSearchBox(onSubmitQuery: submitted.add, onOpenProduct: opened.add),
              const SizedBox(height: 400, child: Text('Shop by category')),
            ]),
          ),
        ),
      ),
    ));
  }

  testWidgets('nothing under 2 characters; 250 ms after typing the matches show', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'a');
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.textContaining('See all results'), findsNothing);
    expect(asked, isEmpty);

    await tester.enterText(find.byType(TextField), 'amo');
    await tester.pump(const Duration(milliseconds: 100));
    expect(asked, isEmpty, reason: 'debounced: no request before 250 ms');
    await tester.pump(const Duration(milliseconds: 200));
    await tester.pump();
    expect(asked, ['amo']);
    expect(find.text('Amoxicillin 500 mg Capsule'), findsOneWidget);
    expect(find.text('2 medicines found'), findsOneWidget);
    expect(find.text('₹84.50'), findsOneWidget);
    // Rx badge for Schedule H (C-08), plain Non-scheduled badge (Sprint 31)
    expect(find.text('Rx'), findsOneWidget);
    expect(find.text('Non-scheduled'), findsOneWidget);
    // In stock: Add (then − qty + against the server cart); out of stock: said so, no Add
    expect(find.text('Add'), findsOneWidget);
    expect(find.text('Out of stock'), findsOneWidget);
    expect(find.text('See all results for “amo”'), findsOneWidget);
  });

  testWidgets('"See all results" and the keyboard Search open the Search tab with the query', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'amox');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await tester.tap(find.text('See all results for “amox”'));
    await tester.pump();
    expect(submitted, ['amox']);
    expect(find.textContaining('See all results'), findsNothing, reason: 'the dropdown closes');

    await tester.enterText(find.byType(TextField), 'paracetamol');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump();
    expect(submitted, ['amox', 'paracetamol']);
  });

  testWidgets('tapping a medicine opens its page', (tester) async {
    await pump(tester);
    await tester.enterText(find.byType(TextField), 'amox');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await tester.tap(find.text('Amoxicillin 500 mg Capsule'));
    await tester.pump();
    expect(opened, ['p1']);
  });

  testWidgets('no match: says so and offers "Did you mean" from the server', (tester) async {
    await pump(tester, products: const [], suggestions: const ['Amoxicillin']);
    await tester.enterText(find.byType(TextField), 'amoxcilin');
    await tester.pump(const Duration(milliseconds: 300));
    await tester.pump();
    await tester.pump(); // the "did you mean" answer
    expect(find.text('No medicines found for “amoxcilin”.'), findsOneWidget);
    expect(find.text('Did you mean:'), findsOneWidget);
    await tester.tap(find.widgetWithText(ActionChip, 'Amoxicillin'));
    await tester.pump();
    await tester.pump();
    expect(asked.last, 'Amoxicillin');
  });

  group('schedule badges come from utils/drug_schedule.dart', () {
    test('list badge text', () {
      expect(scheduleListBadge('Schedule H'), 'Rx');
      expect(scheduleListBadge('Schedule H1'), 'Rx');
      expect(scheduleListBadge('H1'), 'Rx');
      expect(scheduleListBadge('non scheduled'), 'Non-scheduled');
      expect(scheduleListBadge('OTC'), isNull);
      expect(isNeverOnline('Schedule X'), isTrue);
    });
    testWidgets('OTC shows no badge', (tester) async {
      await tester.pumpWidget(const MaterialApp(home: Scaffold(body: ScheduleBadge('OTC'))));
      expect(find.byType(Text), findsNothing);
    });
  });
}
