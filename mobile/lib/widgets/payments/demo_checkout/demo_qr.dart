import 'package:flutter/material.dart';

/// A QR-like drawing for the demo "Scan QR" option. It is NOT a QR code and
/// encodes nothing (never a UPI payment link): a fixed pattern with DEMO across it.
class DemoQr extends StatelessWidget {
  const DemoQr({super.key});

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'Demo QR picture — not a real payment code',
      image: true,
      child: Column(children: [
        SizedBox(
          width: 176,
          height: 176,
          child: Stack(alignment: Alignment.center, children: [
            Container(
              decoration: BoxDecoration(color: Colors.white, border: Border.all(color: Colors.grey.shade300)),
              padding: const EdgeInsets.all(8),
              child: const CustomPaint(size: Size.infinite, painter: _DemoQrPainter()),
            ),
            Transform.rotate(
              angle: -0.35,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 2),
                decoration: BoxDecoration(color: const Color(0xFFF5B82E), borderRadius: BorderRadius.circular(4)),
                child: const Text('DEMO', style: TextStyle(fontWeight: FontWeight.w900, letterSpacing: 3, fontSize: 18, color: Color(0xFF3D2600))),
              ),
            ),
          ]),
        ),
        const SizedBox(height: 6),
        Text('Demo picture only — not a real QR. Scanning it does nothing.',
            textAlign: TextAlign.center, style: TextStyle(fontSize: 11, color: Colors.grey.shade700)),
      ]),
    );
  }
}

class _DemoQrPainter extends CustomPainter {
  const _DemoQrPainter();
  static const n = 21;

  int _finder(int x, int y) {
    for (final o in const [(0, 0), (n - 7, 0), (0, n - 7)]) {
      final dx = x - o.$1, dy = y - o.$2;
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) {
        return (dx == 0 || dy == 0 || dx == 6 || dy == 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)) ? 1 : 0;
      }
    }
    return -1;
  }

  @override
  void paint(Canvas canvas, Size size) {
    final cell = size.shortestSide / n;
    final paint = Paint()..color = const Color(0xFF374151);
    for (var y = 0; y < n; y++) {
      for (var x = 0; x < n; x++) {
        final f = _finder(x, y);
        if (f == 1 || (f == -1 && (x * 7 + y * 13 + x * y) % 5 < 2)) {
          canvas.drawRect(Rect.fromLTWH(x * cell, y * cell, cell, cell), paint);
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
