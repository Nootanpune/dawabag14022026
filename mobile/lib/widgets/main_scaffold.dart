import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Customer shell: Material 3 bottom navigation (Home, Search, Orders,
/// Account). The cart opens from the app-bar cart icon. Doctor and admin
/// screens live outside this shell and keep their own navigation.
class MainScaffold extends StatelessWidget {
  final Widget child;
  const MainScaffold({super.key, required this.child});

  static const _tabs = ['/', '/search', '/orders', '/account'];

  static int indexFor(String location) {
    if (location.startsWith('/search')) return 1;
    if (location.startsWith('/orders')) return 2;
    if (location.startsWith('/account')) return 3;
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final index = indexFor(GoRouterState.of(context).matchedLocation);
    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => context.go(_tabs[i]),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(icon: Icon(Icons.search), selectedIcon: Icon(Icons.search), label: 'Search'),
          NavigationDestination(
              icon: Icon(Icons.receipt_long_outlined), selectedIcon: Icon(Icons.receipt_long), label: 'Orders'),
          NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Account'),
        ],
      ),
    );
  }
}
