import 'package:dawabag/providers/delivery_offer_provider.dart';
import 'package:dawabag/services/delivery_api.dart';
import 'package:dawabag/widgets/home/free_delivery_note.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

Widget _home(Future<int?> Function() offer) => ProviderScope(
      overrides: [freeDeliveryAboveProvider.overrideWith((ref) => offer())],
      child: const MaterialApp(home: Scaffold(body: FreeDeliveryNote())),
    );

void main() {
  test('reads the server amount; anything else means off', () {
    expect(parseFreeDeliveryAbove({'free_delivery_above_paise': 49900}), 49900);
    expect(parseFreeDeliveryAbove({'free_delivery_above_paise': null}), isNull);
    expect(parseFreeDeliveryAbove({'free_delivery_above_paise': '49900'}), isNull);
    expect(parseFreeDeliveryAbove(null), isNull);
  });

  test('formats whole rupees without paise, Indian grouping', () {
    expect(freeDeliveryLine(49900), 'Free delivery on medicines of ₹499 or more');
    expect(rupeesShort(500000), '₹5,000');
    expect(rupeesShort(49950), '₹499.50');
    expect(freeDeliveryLine(null), isNull);
  });

  testWidgets('shows the line when the server returns an amount', (tester) async {
    await tester.pumpWidget(_home(() async => 49900));
    await tester.pump();
    expect(find.text('Free delivery on medicines of ₹499 or more'), findsOneWidget);
  });

  testWidgets('shows nothing when free delivery is off, while loading or on error', (tester) async {
    await tester.pumpWidget(_home(() async => null));
    await tester.pump();
    expect(find.textContaining('Free delivery'), findsNothing);

    await tester.pumpWidget(_home(() async => throw Exception('offline')));
    await tester.pump();
    expect(find.textContaining('Free delivery'), findsNothing);
  });
}
