import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:dio/dio.dart';

import '../../services/api_service.dart';
import '../../providers/cart_provider.dart';
import '../../config/theme.dart';
import '../../widgets/product_card.dart';
import '../../widgets/pincode_banner.dart';

final productsProvider = FutureProvider.family<Map<String, dynamic>, Map<String, String>>(
  (ref, params) async {
    final queryParams = {
      if (params['q']?.isNotEmpty == true) 'q': params['q']!,
      if (params['category']?.isNotEmpty == true) 'category': params['category']!,
      if (params['pincode']?.isNotEmpty == true) 'pincode': params['pincode']!,
      'limit': '20',
    };
    final res = await apiService.dio.get('/products/search', queryParameters: queryParams);
    return res.data['data'] as Map<String, dynamic>;
  },
);

final categoriesProvider = FutureProvider<List<dynamic>>((_) async {
  final res = await apiService.dio.get('/products/categories');
  return res.data['data'] as List<dynamic>;
});

class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  final _searchController = TextEditingController();
  String _query = '';
  String _category = '';
  String _pincode = '';

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      Future.delayed(const Duration(milliseconds: 400), () {
        if (mounted) setState(() => _query = _searchController.text);
      });
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  Map<String, String> get _queryParams => {
    'q': _query,
    'category': _category,
    'pincode': _pincode,
  };

  @override
  Widget build(BuildContext context) {
    final products = ref.watch(productsProvider(_queryParams));
    final categories = ref.watch(categoriesProvider);
    final cartCount = ref.watch(cartProvider).itemCount;

    return Scaffold(
      backgroundColor: const Color(0xFFF9FAFB),
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              color: AppTheme.brandGreen,
              borderRadius: BorderRadius.circular(7),
            ),
            child: const Center(
              child: Text('D', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 14)),
            ),
          ),
          const SizedBox(width: 8),
          const Text('dawabag', style: TextStyle(color: AppTheme.brandGreen, fontWeight: FontWeight.w700)),
        ]),
        actions: [
          Stack(
            children: [
              IconButton(
                icon: const Icon(Icons.shopping_cart_outlined),
                onPressed: () => context.push('/cart'),
              ),
              if (cartCount > 0)
                Positioned(
                  right: 6, top: 6,
                  child: Container(
                    width: 17, height: 17,
                    decoration: const BoxDecoration(color: AppTheme.brandGreen, shape: BoxShape.circle),
                    child: Center(
                      child: Text('$cartCount',
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ),
                ),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppTheme.brandGreen,
        onRefresh: () async => ref.invalidate(productsProvider(_queryParams)),
        child: CustomScrollView(
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: Column(
                  children: [
                    // Pin code banner
                    PinCodeBanner(
                      pincode: _pincode,
                      onPincodeChanged: (p) => setState(() => _pincode = p),
                    ),
                    const SizedBox(height: 12),

                    // Search bar
                    TextField(
                      controller: _searchController,
                      decoration: InputDecoration(
                        hintText: 'Search by brand or generic name...',
                        prefixIcon: const Icon(Icons.search, color: Colors.grey, size: 20),
                        suffixIcon: _query.isNotEmpty
                            ? IconButton(
                                icon: const Icon(Icons.clear, size: 18),
                                onPressed: () { _searchController.clear(); setState(() => _query = ''); },
                              )
                            : null,
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ),

            // Category chips
            SliverToBoxAdapter(
              child: categories.when(
                data: (cats) => SizedBox(
                  height: 38,
                  child: ListView(
                    scrollDirection: Axis.horizontal,
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    children: [
                      _CategoryChip(label: 'All', selected: _category.isEmpty, onTap: () => setState(() => _category = '')),
                      ...cats.map((c) => _CategoryChip(
                        label: c['category'],
                        selected: _category == c['category'],
                        onTap: () => setState(() => _category = c['category']),
                      )),
                    ],
                  ),
                ),
                loading: () => const SizedBox(height: 38),
                error: (_, __) => const SizedBox(height: 38),
              ),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 16)),

            // Product grid
            products.when(
              data: (data) {
                final productList = (data['products'] as List?) ?? [];
                if (productList.isEmpty) {
                  return SliverFillRemaining(
                    child: Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.medication_outlined, size: 56, color: Colors.grey.shade300),
                          const SizedBox(height: 12),
                          Text('No medicines found', style: TextStyle(color: Colors.grey.shade500, fontWeight: FontWeight.w500)),
                          const SizedBox(height: 4),
                          Text('Try a different search or category', style: TextStyle(color: Colors.grey.shade400, fontSize: 13)),
                        ],
                      ),
                    ),
                  );
                }
                return SliverPadding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  sliver: SliverGrid(
                    delegate: SliverChildBuilderDelegate(
                      (context, i) => ProductCard(
                        product: productList[i] as Map<String, dynamic>,
                        onAddToCart: (product) => _addToCart(context, ref, product),
                        onTap: () => context.push('/shop/${productList[i]['id']}'),
                      ),
                      childCount: productList.length,
                    ),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      childAspectRatio: 0.72,
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                    ),
                  ),
                );
              },
              loading: () => SliverPadding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                sliver: SliverGrid(
                  delegate: SliverChildBuilderDelegate(
                    (_, __) => Container(decoration: BoxDecoration(
                      color: Colors.grey.shade100,
                      borderRadius: BorderRadius.circular(12),
                    )),
                    childCount: 6,
                  ),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2, childAspectRatio: 0.72,
                    crossAxisSpacing: 12, mainAxisSpacing: 12,
                  ),
                ),
              ),
              error: (err, _) => SliverToBoxAdapter(
                child: Center(child: Text('Error: $err')),
              ),
            ),

            const SliverToBoxAdapter(child: SizedBox(height: 24)),
          ],
        ),
      ),
    );
  }

  void _addToCart(BuildContext context, WidgetRef ref, Map<String, dynamic> product) {
    final schedule = product['drug_schedule'] as String? ?? 'OTC';
    if (['NDPS', 'Schedule X'].contains(schedule)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This medicine cannot be ordered online'), backgroundColor: Colors.red),
      );
      return;
    }
    if (!(product['in_stock'] as bool? ?? false)) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Out of stock')),
      );
      return;
    }
    ref.read(cartProvider.notifier).addItem(CartItem(
      productId: product['id'],
      name: product['name'],
      sku: product['sku'],
      quantity: 1,
      unitPricePaise: product['offer_price_paise'],
      mrpPaise: product['mrp_paise'],
      drugSchedule: schedule,
      maxQty: product['max_qty_per_order'] ?? 3,
      coldChain: product['cold_chain'] ?? false,
    ));
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text('${product['name']} added to cart'),
        backgroundColor: AppTheme.brandGreen,
        duration: const Duration(seconds: 2),
      ),
    );
  }
}

class _CategoryChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _CategoryChip({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(right: 8),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppTheme.brandGreen : Colors.white,
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: selected ? AppTheme.brandGreen : Colors.grey.shade300,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? Colors.white : Colors.grey.shade700,
            fontSize: 13,
            fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
          ),
        ),
      ),
    );
  }
}
