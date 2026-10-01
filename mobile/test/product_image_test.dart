import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/models/cart_view.dart';
import 'package:dawabag/widgets/product_image.dart';

Widget _wrap(Widget child) => MaterialApp(home: Scaffold(body: Center(child: child)));

void main() {
  testWidgets('placeholder shows initial and inferred dosage form', (tester) async {
    await tester.pumpWidget(_wrap(const ProductImage(name: 'dolo 650 Tablet', height: 120, width: 120)));
    expect(find.text('D'), findsOneWidget);
    expect(find.text('Tablet'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
  });

  testWidgets('no form label when the name has none', (tester) async {
    await tester.pumpWidget(_wrap(const ProductImage(name: 'Paracetamol', height: 120, width: 120)));
    expect(find.text('P'), findsOneWidget);
    expect(find.text('Tablet'), findsNothing);
  });

  testWidgets('compact thumbnail hides the form label', (tester) async {
    await tester.pumpWidget(_wrap(const ProductImage(name: 'Omez Capsule', height: 52, width: 52, compact: true)));
    expect(find.text('O'), findsOneWidget);
    expect(find.text('Capsule'), findsNothing);
  });

  testWidgets('a photo link shows the network image, with the placeholder while it loads', (tester) async {
    await tester.pumpWidget(_wrap(ProductImage.fromProduct(
      const {'name': 'Dolo 650 Tablet', 'image_url': 'https://photos.example/products/p1/a.png?X-Amz-Signature=x'},
      height: 120,
      width: 120,
    )));
    final image = tester.widget<Image>(find.byType(Image));
    expect((image.image as NetworkImage).url, startsWith('https://photos.example/products/p1/a.png'));
    expect(image.semanticLabel, 'Dolo 650 Tablet');
    // Nothing has arrived yet: the initial + dosage form tile stands in
    expect(find.text('D'), findsOneWidget);
    expect(find.text('Tablet'), findsOneWidget);
  });

  testWidgets('a photo that fails to load falls back to the placeholder', (tester) async {
    await tester.pumpWidget(_wrap(const ProductImage(
      name: 'Omez Capsule',
      imageUrl: 'https://photos.example/expired.png',
      height: 120,
      width: 120,
    )));
    // The test HTTP client answers 400, like an expired signed link would
    await tester.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 200)));
    await tester.pump();
    expect(tester.takeException(), isNull);
    expect(find.text('O'), findsOneWidget);
    expect(find.text('Capsule'), findsOneWidget);
  });

  group('CartLine', () {
    test('parses image_url from the cart', () {
      final line = CartLine.fromJson(const {
        'product_id': 'p1', 'name': 'Dolo', 'quantity': 1, 'unit_price_paise': 100, 'mrp_paise': 100,
        'line_subtotal_paise': 100, 'image_key': 'products/p1/a.png', 'image_url': 'https://photos.example/a.png',
      });
      expect(line.imageUrl, 'https://photos.example/a.png');
      expect(CartLine.fromJson(const {'product_id': 'p2', 'name': 'X'}).imageUrl, isNull);
    });
  });

  group('imageUrlOf', () {
    test('uses image_url when present', () {
      expect(ProductImage.imageUrlOf({'image_url': 'https://cdn.example/x.png'}), 'https://cdn.example/x.png');
    });
    test('ignores a bare object-store key', () {
      expect(ProductImage.imageUrlOf({'s3_image_key': 'products/abc.png'}), isNull);
    });
    test('never treats an object-store key as a link, even a URL-like one', () {
      expect(ProductImage.imageUrlOf({'s3_image_key': 'https://cdn.example/y.png'}), isNull);
      expect(ProductImage.imageUrlOf({'image_key': 'https://cdn.example/y.png'}), isNull);
    });
    test('ignores a non-http image_url', () => expect(ProductImage.imageUrlOf({'image_url': 'products/x.png'}), isNull));
    test('null when nothing is given', () => expect(ProductImage.imageUrlOf({}), isNull));
  });
}
