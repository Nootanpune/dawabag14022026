import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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

  group('imageUrlOf', () {
    test('uses image_url when present', () {
      expect(ProductImage.imageUrlOf({'image_url': 'https://cdn.example/x.png'}), 'https://cdn.example/x.png');
    });
    test('ignores a bare object-store key', () {
      expect(ProductImage.imageUrlOf({'s3_image_key': 'products/abc.png'}), isNull);
    });
    test('accepts a full URL in s3_image_key', () {
      expect(ProductImage.imageUrlOf({'s3_image_key': 'https://cdn.example/y.png'}), 'https://cdn.example/y.png');
    });
    test('null when nothing is given', () => expect(ProductImage.imageUrlOf({}), isNull));
  });
}
