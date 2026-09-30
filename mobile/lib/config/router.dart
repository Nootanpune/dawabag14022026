import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register/register_screen.dart';
import '../screens/auth/otp_screen.dart';
import '../screens/shop/home_screen.dart';
import '../screens/shop/product_detail_screen.dart';
import '../screens/cart/cart_screen.dart';
import '../screens/checkout/checkout_screen.dart';
import '../screens/orders/orders_screen.dart';
import '../screens/orders/order_detail_screen.dart';
import '../screens/account/account_screen.dart';
import '../screens/account/refill_screen.dart';
import '../screens/account/grievances/grievance_detail_screen.dart';
import '../screens/account/grievances/grievance_list_screen.dart';
import '../screens/account/grievances/new_grievance_screen.dart';
import '../screens/account/legal/legal_screen.dart';
import '../screens/account/privacy/privacy_screen.dart';
import '../screens/doctor/doctor_list_screen.dart';
import '../screens/doctor/doctor_portal_screen.dart';
import '../screens/admin/admin_screen.dart';
import '../widgets/main_scaffold.dart';

final routerProvider = Provider<GoRouter>((ref) {
  // Re-run redirects when the signed-in state flips, instead of rebuilding
  // the whole GoRouter on every AuthState change (which reset navigation to
  // '/' whenever isLoading toggled, e.g. in the middle of registration).
  final authRefresh = ValueNotifier<int>(0);
  ref.listen<AuthState>(authProvider, (previous, next) {
    if (previous?.isAuthenticated != next.isAuthenticated) {
      authRefresh.value++;
    }
  });

  final router = GoRouter(
    initialLocation: '/',
    refreshListenable: authRefresh,
    redirect: (context, state) {
      final isLoggedIn = ref.read(authProvider).isAuthenticated;
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
      // Complaints (C-36). '/new' is listed before '/:id' so it is not taken as an id.
      GoRoute(path: '/account/complaints', builder: (c, s) => const GrievanceListScreen()),
      GoRoute(
        path: '/account/complaints/new',
        builder: (c, s) => NewGrievanceScreen(
          orderId: s.uri.queryParameters['orderId'],
          orderNumber: s.uri.queryParameters['orderNumber'],
        ),
      ),
      GoRoute(
        path: '/account/complaints/:id',
        builder: (c, s) => GrievanceDetailScreen(grievanceId: s.pathParameters['id']!),
      ),
      // Consents and data rights (C-40..C-44)
      GoRoute(path: '/account/privacy', builder: (c, s) => const PrivacyScreen()),
      // Statutory disclosures — public, no sign-in needed (C-04)
      GoRoute(path: '/legal', builder: (c, s) => const LegalScreen()),
      GoRoute(path: '/doctors', builder: (c, s) => const DoctorListScreen()),
      GoRoute(path: '/doctor/portal', builder: (c, s) => const DoctorPortalScreen()),
      GoRoute(path: '/admin', builder: (c, s) => const AdminScreen()),
    ],
    errorBuilder: (context, state) => Scaffold(
      body: Center(child: Text('Page not found: ${state.matchedLocation}')),
    ),
  );

  ref.onDispose(() {
    router.dispose();
    authRefresh.dispose();
  });
  return router;
});
