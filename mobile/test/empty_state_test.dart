import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/widgets/empty_state.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: child));

void main() {
  testWidgets('shows icon, title and hint without an action', (tester) async {
    await tester.pumpWidget(_wrap(const EmptyState(
      icon: Icons.shopping_cart_outlined,
      title: 'Your cart is empty',
      hint: 'Search for a medicine',
    )));
    expect(find.byIcon(Icons.shopping_cart_outlined), findsOneWidget);
    expect(find.text('Your cart is empty'), findsOneWidget);
    expect(find.text('Search for a medicine'), findsOneWidget);
    expect(find.byType(ElevatedButton), findsNothing);
  });

  testWidgets('action button calls back', (tester) async {
    var tapped = 0;
    await tester.pumpWidget(_wrap(EmptyState(
      icon: Icons.receipt_long_outlined,
      title: 'No orders yet',
      actionLabel: 'Search medicines',
      onAction: () => tapped++,
    )));
    await tester.tap(find.text('Search medicines'));
    expect(tapped, 1);
  });

  testWidgets('label without callback shows no button', (tester) async {
    await tester.pumpWidget(_wrap(const EmptyState(
      icon: Icons.search, title: 'Nothing', actionLabel: 'Go')));
    expect(find.byType(ElevatedButton), findsNothing);
  });
}
