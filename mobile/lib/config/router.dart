import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/auth/otp_screen.dart';
import '../screens/shop/home_screen.dart';
import '../screens/shop/product_detail_screen.dart';
import '../screens/cart/cart_screen.dart';
import '../screens/checkout/checkout_screen.dart';
import '../screens/orders/orders_screen.dart';
import '../screens/orders/order_detail_screen.dart';
import '../screens/account/account_screen.dart';
import '../screens/account/refill_screen.dart';
import '../screens/doctor/doctor_list_screen.dart';
import '../screens/doctor/doctor_portal_screen.dart';
import '../screens/admin/admin_screen.dart';
import '../widgets/main_scaffold.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final authState = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/',
    redirect: (context, state) {
      final isLoggedIn = authState.isAuthenticated;
      final isAuthRoute = state.matchedLocation.startsWith('/auth');

      // Protected routes
      final protectedRoutes = ['/checkout', '/orders', '/account', '/doctor/portal', '/admin'];
      final isProtected = protectedRoutes.any((r) => state.matchedLocation.startsWith(r));

      if (!isLoggedIn && isProtected) return '/auth/login?from=${state.matchedLocation}';
      if (isLoggedIn && isAuthRoute) return '/';
      return null;
    },
    routes: [
      // Shell route with bottom nav
      ShellRoute(
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(path: '/', builder: (c, s) => const HomeScreen()),
          GoRoute(path: '/cart', builder: (c, s) => const CartScreen()),
          GoRoute(path: '/orders', builder: (c, s) => const OrdersScreen()),
          GoRoute(path: '/account', builder: (c, s) => const AccountScreen()),
        ],
      ),

      // Full-screen routes (no bottom nav)
      GoRoute(path: '/auth/login', builder: (c, s) => const LoginScreen()),
      GoRoute(path: '/auth/register', builder: (c, s) => const RegisterScreen()),
      GoRoute(
        path: '/auth/otp',
        builder: (c, s) => OTPScreen(mobile: s.uri.queryParameters['mobile'] ?? ''),
      ),
      GoRoute(
        path: '/shop/:productId',
        builder: (c, s) => ProductDetailScreen(productId: s.pathParameters['productId']!),
      ),
      GoRoute(path: '/checkout', builder: (c, s) => const CheckoutScreen()),
      GoRoute(
        path: '/orders/:orderId',
        builder: (c, s) => OrderDetailScreen(orderId: s.pathParameters['orderId']!),
      ),
      GoRoute(path: '/account/refills', builder: (c, s) => const RefillScreen()),
      GoRoute(path: '/doctors', builder: (c, s) => const DoctorListScreen()),
      GoRoute(path: '/doctor/portal', builder: (c, s) => const DoctorPortalScreen()),
      GoRoute(path: '/admin', builder: (c, s) => const AdminScreen()),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(child: Text('Page not found: ${state.matchedLocation}')),
    ),
  );
});
