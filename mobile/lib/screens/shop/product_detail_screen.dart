import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../config/theme.dart';
import '../../services/api_service.dart';
import '../../utils/drug_schedule.dart';
import '../../widgets/error_retry_view.dart';
import '../../widgets/product_image.dart';
import 'widgets/product_badges.dart';
import 'widgets/product_buy_bar.dart';
import 'widgets/product_declarations.dart';
import 'widgets/product_price.dart';

/// GET /products/:id — the public product page (server data only).
final productDetailProvider = FutureProvider.family<Map<String, dynamic>, String>((ref, id) async {
  final res = await apiService.dio.get('/products/$id');
  return res.data['data'] as Map<String, dynamic>;
});

class ProductDetailScreen extends ConsumerWidget {
  final String productId;
  const ProductDetailScreen({super.key, required this.productId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final productAsync = ref.watch(productDetailProvider(productId));

    return Scaffold(
      appBar: AppBar(title: const Text('Product details')),
      body: productAsync.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load this product'),
          onRetry: () => ref.invalidate(productDetailProvider(productId)),
        ),
        data: (product) => _Body(product: product),
      ),
      bottomNavigationBar: productAsync.maybeWhen(
        data: (product) => ProductBuyBar(product: product),
        orElse: () => const SizedBox.shrink(),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  final Map<String, dynamic> product;
  const _Body({required this.product});

  @override
  Widget build(BuildContext context) {
    final inStock = product['in_stock'] == true;
    final marketedBy = product['marketed_by']?.toString();
    // Product copy is sent only once a pharmacist has approved it (C-19);
    // until then nothing is shown, and no staff-facing notice either.
    final description = product['description']?.toString().trim();
    return ListView(
      children: [
        ProductImage.fromProduct(product, height: 200, width: double.infinity, borderRadius: BorderRadius.zero),
        Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(product['name']?.toString() ?? '',
                  style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
              if (marketedBy != null && marketedBy.trim().isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(marketedBy, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
              ],
              const SizedBox(height: 12),
              ProductBadges(
                schedule: product['drug_schedule']?.toString() ?? 'OTC',
                coldChain: product['cold_chain'] == true,
              ),
              const SizedBox(height: 16),
              ProductPrice(product: product),
              if (!inStock)
                Container(
                  margin: const EdgeInsets.only(top: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(6)),
                  child: Text('Out of stock',
                      style: TextStyle(fontSize: 13, color: Colors.red.shade800, fontWeight: FontWeight.w600)),
                ),
              if (isRxSchedule(product['drug_schedule']?.toString())) const _RxNotice(),
              if (description != null && description.isNotEmpty) ...[
                const SizedBox(height: 16),
                Text(description, style: const TextStyle(fontSize: 14, height: 1.45)),
              ],
              ProductDeclarations(product: product),
              const SizedBox(height: 100),
            ],
          ),
        ),
      ],
    );
  }
}

/// Prescription-only medicine: a pharmacist verifies the prescription before
/// dispatch (C-08).
class _RxNotice extends StatelessWidget {
  const _RxNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: AppTheme.amberBadge, borderRadius: BorderRadius.circular(10)),
      child: const Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.description_outlined, size: 18, color: AppTheme.amberText),
          SizedBox(width: 8),
          Expanded(
            child: Text(
              'Needs a doctor’s prescription. Choose or upload it at checkout; '
              'our pharmacist checks it before dispatch.',
              style: TextStyle(fontSize: 12, color: AppTheme.amberText),
            ),
          ),
        ],
      ),
    );
  }
}
