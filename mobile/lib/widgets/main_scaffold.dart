import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../config/theme.dart';
import '../providers/cart_provider.dart';

class MainScaffold extends ConsumerWidget {
  final Widget child;
  const MainScaffold({super.key, required this.child});

  int _locationToIndex(String location) {
    if (location.startsWith('/cart')) return 1;
    if (location.startsWith('/orders')) return 2;
    if (location.startsWith('/account')) return 3;
    return 0;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).matchedLocation;
    final currentIndex = _locationToIndex(location);
    final cartCount = ref.watch(cartProvider).itemCount;

    return Scaffold(
      body: child,
      bottomNavigationBar: Container(
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Colors.grey.shade200, width: 0.5)),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: [
                _NavItem(icon: Icons.home_outlined, activeIcon: Icons.home, label: 'Home',
                  index: 0, currentIndex: currentIndex, onTap: () => context.go('/')),
                _NavItem(icon: Icons.shopping_cart_outlined, activeIcon: Icons.shopping_cart,
                  label: 'Cart', index: 1, currentIndex: currentIndex,
                  badge: cartCount > 0 ? '$cartCount' : null,
                  onTap: () => context.go('/cart')),
                _NavItem(icon: Icons.receipt_long_outlined, activeIcon: Icons.receipt_long,
                  label: 'Orders', index: 2, currentIndex: currentIndex,
                  onTap: () => context.go('/orders')),
                _NavItem(icon: Icons.person_outline, activeIcon: Icons.person,
                  label: 'Account', index: 3, currentIndex: currentIndex,
                  onTap: () => context.go('/account')),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final int index;
  final int currentIndex;
  final String? badge;
  final VoidCallback onTap;

  const _NavItem({
    required this.icon, required this.activeIcon, required this.label,
    required this.index, required this.currentIndex, required this.onTap, this.badge,
  });

  @override
  Widget build(BuildContext context) {
    final active = index == currentIndex;
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: SizedBox(
        width: 64,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              clipBehavior: Clip.none,
              children: [
                Icon(active ? activeIcon : icon,
                  color: active ? AppTheme.brandGreen : Colors.grey,
                  size: 24),
                if (badge != null)
                  Positioned(
                    right: -8, top: -6,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppTheme.brandGreen,
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(badge!,
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 3),
            Text(label,
              style: TextStyle(
                fontSize: 11,
                color: active ? AppTheme.brandGreen : Colors.grey,
                fontWeight: active ? FontWeight.w600 : FontWeight.normal,
              )),
          ],
        ),
      ),
    );
  }
}
