import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../config/theme.dart';
import '../../providers/cart_provider.dart';
import '../../providers/catalog_provider.dart';
import '../../providers/delivery_offer_provider.dart';
import '../../widgets/cart_action_button.dart';
import '../../widgets/home/category_tiles.dart';
import '../../widgets/home/consult_doctor_tile.dart';
import '../../widgets/home/free_delivery_note.dart';
import '../../widgets/home/prescription_cta.dart';
import '../../widgets/home/prescription_steps_sheet.dart';
import '../../widgets/home/search_entry.dart';
import '../../widgets/home/section_header.dart';
import '../../widgets/home/trust_strip.dart';
import '../../widgets/legal/legal_summary_tile.dart';
import '../../widgets/pincode_banner.dart';
import 'widgets/brand_title.dart';
import 'widgets/product_grid.dart';

/// Home / shop (Direction A — clinical trust): search, trust badges, the
/// prescription and consultation entries, categories and products. All data
/// comes from the server; the category filter lives in memory only.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  String _category = '';

  void _onUploadPrescription() {
    final cartHasItems = ref.read(cartProvider).itemCount > 0;
    showPrescriptionStepsSheet(
      context,
      cartHasItems: cartHasItems,
      onGoToCart: () => context.push('/cart'),
      onSearch: () => context.go('/search'),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pincode = ref.watch(browsePincodeProvider);
    final queryKey = productsQueryKey(category: _category, pincode: pincode);
    final products = ref.watch(productsProvider(queryKey));
    final categories = ref.watch(categoriesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const BrandTitle(),
        actions: const [CartActionButton()],
      ),
      body: RefreshIndicator(
        color: AppTheme.brandGreen,
        onRefresh: () async {
          ref.invalidate(categoriesProvider);
          ref.invalidate(freeDeliveryAboveProvider);
          return ref.refresh(productsProvider(queryKey).future);
        },
        child: CustomScrollView(
          slivers: [
            SliverPadding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              sliver: SliverList.list(children: [
                PinCodeBanner(
                  key: ValueKey('pin_$pincode'),
                  pincode: pincode,
                  onPincodeChanged: (p) => ref.read(typedPincodeProvider.notifier).state = p,
                ),
                const SizedBox(height: 12),
                SearchEntry(onTap: () => context.go('/search')),
                const FreeDeliveryNote(),
                const SizedBox(height: 10),
                const TrustStrip(),
                const SizedBox(height: 16),
                PrescriptionCta(onUpload: _onUploadPrescription),
                const SizedBox(height: 10),
                ConsultDoctorTile(onTap: () => context.push('/doctors')),
              ]),
            ),
            SliverToBoxAdapter(
              child: categories.maybeWhen(
                data: (cats) => cats.isEmpty
                    ? const SizedBox.shrink()
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const SectionHeader('Shop by category'),
                          CategoryTiles(
                            categories: [
                              for (final c in cats)
                                if ((c as Map)['category']?.toString() case final name? when name.isNotEmpty) name,
                            ],
                            selected: _category,
                            onSelected: (c) => setState(() => _category = c),
                          ),
                        ],
                      ),
                orElse: () => const SizedBox.shrink(),
              ),
            ),
            SliverToBoxAdapter(
              child: SectionHeader(_category.isEmpty ? 'Medicines' : _category),
            ),
            ProductGrid(
              products: products,
              onRetry: () => ref.invalidate(productsProvider(queryKey)),
              onClearFilter: _category.isEmpty ? null : () => setState(() => _category = ''),
            ),
            // Statutory disclosures, compact but always reachable (C-04, C-36)
            const SliverPadding(
              padding: EdgeInsets.fromLTRB(16, 24, 16, 24),
              sliver: SliverToBoxAdapter(child: LegalSummaryTile()),
            ),
          ],
        ),
      ),
    );
  }
}
