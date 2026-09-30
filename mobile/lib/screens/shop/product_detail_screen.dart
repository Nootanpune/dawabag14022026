// ─── product_detail_screen.dart ───────────────────────────────────────────────
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../services/api_service.dart';
import '../../providers/cart_provider.dart';
import '../../config/theme.dart';
import '../../utils/formatters.dart';

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
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (product) {
          final cannotOrder = ['NDPS', 'Schedule X'].contains(product['drug_schedule']);
          final inStock = product['in_stock'] ?? false;
          return ListView(
            children: [
              Container(
                height: 200, color: AppTheme.brandGreen50,
                child: const Center(child: Text('💊', style: TextStyle(fontSize: 72))),
              ),
              Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(product['name'] ?? '', style: const TextStyle(fontSize: 19, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    if (product['marketed_by'] != null)
                      Text(product['marketed_by'], style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        _ScheduleBadge(schedule: product['drug_schedule'] ?? 'OTC'),
                        const SizedBox(width: 8),
                        if (product['cold_chain'] == true)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: const Color(0xFFE6F1FB), borderRadius: BorderRadius.circular(20)),
                            child: const Row(mainAxisSize: MainAxisSize.min, children: [
                              Icon(Icons.ac_unit, size: 12, color: Color(0xFF185FA5)),
                              SizedBox(width: 4),
                              Text('Cold chain', style: TextStyle(fontSize: 11, color: Color(0xFF0C447C), fontWeight: FontWeight.w600)),
                            ]),
                          ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.baseline,
                      textBaseline: TextBaseline.alphabetic,
                      children: [
                        Text(formatPrice(product['offer_price_paise'] ?? 0),
                          style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700, color: AppTheme.brandGreen600)),
                        const SizedBox(width: 10),
                        if ((product['discount_pct'] ?? 0) > 0) ...[
                          Text(formatPrice(product['mrp_paise'] ?? 0),
                            style: TextStyle(fontSize: 15, color: Colors.grey.shade400, decoration: TextDecoration.lineThrough)),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(6)),
                            child: Text('${product['discount_pct']}% off',
                              style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.green)),
                          ),
                        ],
                      ],
                    ),
                    if (!inStock)
                      Container(
                        margin: const EdgeInsets.only(top: 8),
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(6)),
                        child: const Text('Out of stock', style: TextStyle(fontSize: 13, color: Colors.red, fontWeight: FontWeight.w600)),
                      ),
                    const Divider(height: 28),
                    const Text('Product details', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    const SizedBox(height: 10),
                    _DetailRow('Generic name', product['generic_name']),
                    _DetailRow('SKU', product['sku']),
                    _DetailRow('Category', product['category']),
                    _DetailRow('Schedule', product['drug_schedule']),
                    if (product['composition'] != null) _DetailRow('Composition', product['composition']),
                    if (product['storage_instructions'] != null) _DetailRow('Storage', product['storage_instructions']),
                    if (['Schedule H','Schedule H1'].contains(product['drug_schedule']))
                      Container(
                        margin: const EdgeInsets.only(top: 12),
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(color: const Color(0xFFFAEEDA), borderRadius: BorderRadius.circular(10)),
                        child: const Text('Prescription required. A valid doctor\'s prescription must be uploaded before this item can be dispatched.',
                          style: TextStyle(fontSize: 12, color: Color(0xFF633806))),
                      ),
                    const SizedBox(height: 100),
                  ],
                ),
              ),
            ],
          );
        },
      ),
      bottomNavigationBar: productAsync.maybeWhen(
        data: (product) {
          final cannotOrder = ['NDPS', 'Schedule X'].contains(product['drug_schedule']);
          final inStock = product['in_stock'] ?? false;
          return SafeArea(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: ElevatedButton.icon(
                onPressed: cannotOrder || !inStock ? null : () {
                  ref.read(cartProvider.notifier).addItem(CartItem(
                    productId: product['id'], name: product['name'], sku: product['sku'],
                    quantity: 1, unitPricePaise: product['offer_price_paise'],
                    mrpPaise: product['mrp_paise'], drugSchedule: product['drug_schedule'],
                    maxQty: product['max_qty_per_order'] ?? 3, coldChain: product['cold_chain'] ?? false,
                  ));
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: const Text('Added to cart'), backgroundColor: AppTheme.brandGreen, duration: const Duration(seconds: 2)),
                  );
                  context.push('/cart');
                },
                icon: const Icon(Icons.shopping_cart),
                label: Text(cannotOrder ? 'Not available online' : !inStock ? 'Out of stock' : 'Add to cart'),
              ),
            ),
          );
        },
        orElse: () => const SizedBox.shrink(),
      ),
    );
  }
}

class _ScheduleBadge extends StatelessWidget {
  final String schedule;
  const _ScheduleBadge({required this.schedule});

  @override
  Widget build(BuildContext context) {
    final isH = schedule.contains('H');
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: isH ? const Color(0xFFFAEEDA) : AppTheme.brandGreen50,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(schedule, style: TextStyle(
        fontSize: 11, fontWeight: FontWeight.w600,
        color: isH ? const Color(0xFF633806) : AppTheme.brandGreen700,
      )),
    );
  }
}

class _DetailRow extends StatelessWidget {
  final String label;
  final dynamic value;
  const _DetailRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    if (value == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 100, child: Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade500))),
          Expanded(child: Text(value.toString(), style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500))),
        ],
      ),
    );
  }
}
