import 'package:dawabag/models/cart_view.dart';
import 'package:dawabag/screens/cart/widgets/free_delivery_progress.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('reads the server offer, or none', () {
    final c = CartView.fromJson({'free_delivery': {'above_paise': 49900, 'remaining_paise': 45900}});
    expect(c.freeDelivery!.reached, isFalse);
    expect(c.freeDelivery!.progress, closeTo(0.08, 0.01));
    expect(CartView.fromJson({'free_delivery': null}).freeDelivery, isNull);
  });

  testWidgets('says how much more is needed, then that delivery is free', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: FreeDeliveryProgress(
        offer: FreeDelivery(abovePaise: 49900, remainingPaise: 45900)))));
    expect(find.textContaining('more for free delivery'), findsOneWidget);
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: FreeDeliveryProgress(
        offer: FreeDelivery(abovePaise: 49900, remainingPaise: 0)))));
    expect(find.text('You get free delivery on this order'), findsOneWidget);
  });
}
