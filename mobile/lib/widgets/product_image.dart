import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../utils/dosage_form.dart';

/// Product pack photo: the server's short-lived signed `image_url` (the photo
/// lives only in the server object store, and customers get it only after a
/// pharmacist approved it — C-19), otherwise — and while loading or on error —
/// a soft brand-tinted tile with the product's initial and a dosage-form label
/// guessed from the name. Images are only held in Flutter's in-memory cache;
/// nothing is written to the device.
class ProductImage extends StatelessWidget {
  final String name;
  final String? imageUrl;
  final double? height;
  final double? width;
  final BorderRadius borderRadius;
  /// Smaller initial and label for list thumbnails.
  final bool compact;

  const ProductImage({
    super.key,
    required this.name,
    this.imageUrl,
    this.height,
    this.width,
    this.borderRadius = const BorderRadius.all(Radius.circular(12)),
    this.compact = false,
  });

  /// Reads the photo link from a product map: the API's `image_url`, when it is
  /// an http(s) URL. Object-store keys (`s3_image_key`, `image_key`) are never
  /// fetched directly — the bucket is private.
  factory ProductImage.fromProduct(
    Map<String, dynamic> product, {
    Key? key,
    double? height,
    double? width,
    BorderRadius borderRadius = const BorderRadius.all(Radius.circular(12)),
    bool compact = false,
  }) {
    return ProductImage(
      key: key,
      name: product['name']?.toString() ?? '',
      imageUrl: imageUrlOf(product),
      height: height,
      width: width,
      borderRadius: borderRadius,
      compact: compact,
    );
  }

  static String? imageUrlOf(Map<String, dynamic> product) {
    final v = product['image_url']?.toString().trim();
    if (v != null && (v.startsWith('https://') || v.startsWith('http://'))) return v;
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final url = imageUrl;
    final placeholder = _Placeholder(name: name, compact: compact);
    return ClipRRect(
      borderRadius: borderRadius,
      child: SizedBox(
        height: height,
        width: width,
        child: url == null
            ? placeholder
            : ColoredBox(
                color: Colors.white,
                child: Image.network(
                  url,
                  fit: BoxFit.contain,
                  semanticLabel: name,
                  errorBuilder: (_, __, ___) => placeholder,
                  // Placeholder until the first frame has arrived
                  frameBuilder: (_, child, frame, wasSynchronouslyLoaded) =>
                      frame == null && !wasSynchronouslyLoaded ? placeholder : child,
                ),
              ),
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  final String name;
  final bool compact;
  const _Placeholder({required this.name, required this.compact});

  @override
  Widget build(BuildContext context) {
    final trimmed = name.trim();
    final initial = trimmed.isEmpty ? '?' : trimmed.characters.first.toUpperCase();
    final form = inferDosageForm(name);
    return Container(
      color: AppTheme.brandGreen50,
      alignment: Alignment.center,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(initial,
              style: TextStyle(
                fontSize: compact ? 20 : 34,
                fontWeight: FontWeight.w700,
                color: AppTheme.brandGreen700,
              )),
          if (form != null && !compact) ...[
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.85),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Text(form.label,
                  style: const TextStyle(
                      fontSize: 10, fontWeight: FontWeight.w600, color: AppTheme.brandGreen700)),
            ),
          ],
        ],
      ),
    );
  }
}
