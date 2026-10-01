import 'package:flutter/material.dart';

import '../config/theme.dart';
import '../utils/dosage_form.dart';

/// Product picture: the network image when the API gives an absolute image
/// URL, otherwise a soft brand-tinted tile with the product's initial and a
/// dosage-form label guessed from the name. Images are only held in Flutter's
/// in-memory cache; nothing is written to the device.
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

  /// Reads the image URL from a product map (`image_url`, or `s3_image_key`
  /// / `image_key` only when the server already sent a full http(s) URL).
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
    for (final k in const ['image_url', 's3_image_key', 'image_key']) {
      final v = product[k]?.toString().trim();
      if (v != null && (v.startsWith('https://') || v.startsWith('http://'))) return v;
    }
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
            : Image.network(
                url,
                fit: BoxFit.cover,
                errorBuilder: (_, __, ___) => placeholder,
                loadingBuilder: (_, child, progress) => progress == null ? child : placeholder,
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
