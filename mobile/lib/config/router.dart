import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../models/consultation.dart';
import '../providers/auth_provider.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register/register_screen.dart';
import '../screens/auth/otp_screen.dart';
import '../screens/shop/home_screen.dart';
import '../screens/shop/product_detail_screen.dart';
import '../screens/search/search_screen.dart';
import '../screens/cart/cart_screen.dart';
import '../screens/checkout/checkout_screen.dart';
import '../screens/orders/orders_screen.dart';
import '../screens/orders/order_detail_screen.dart';
import '../screens/account/account_screen.dart';
import '../screens/account/refill_screen.dart';
import '../screens/account/grievances/grievance_detail_screen.dart';
import '../screens/account/grievances/grievance_list_screen.dart';
import '../screens/account/grievances/new_grievance_screen.dart';
import '../screens/account/addresses/address_form_screen.dart';
import '../screens/account/addresses/address_list_screen.dart';
import '../screens/account/legal/legal_screen.dart';
import '../screens/account/legal/policy_screen.dart';
import '../screens/account/privacy/privacy_screen.dart';
import '../screens/account/returns/new_return_screen.dart';
import '../screens/account/returns/return_detail_screen.dart';
import '../screens/account/returns/returns_screen.dart';
import '../screens/account/side_effects/new_side_effect_screen.dart';
import '../screens/account/side_effects/side_effect_list_screen.dart';
import '../screens/consultations/book_consultation_screen.dart';
import '../screens/consultations/call/video_call_screen.dart';
import '../screens/consultations/eprescription_screen.dart';
import '../screens/consultations/join_consultation_screen.dart';
import '../screens/consultations/my_consultations_screen.dart';
import '../screens/doctor/doctor_detail_screen.dart';
import '../screens/doctor/doctor_list_screen.dart';
import '../screens/doctor/doctor_portal_screen.dart';
import '../screens/doctor/portal/doctor_consultations_screen.dart';
import '../screens/admin/admin_screen.dart';
import '../screens/prescriptions/prescriptions_screen.dart';
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
      final protectedRoutes = ['/checkout', '/orders', '/account', '/consultations', '/doctor/portal', '/doctor/consultations', '/admin'];
      final isProtected = protectedRoutes.any((r) => state.matchedLocation.startsWith(r));

      if (!isLoggedIn && isProtected) return '/auth/login?from=${state.matchedLocation}';
      if (isLoggedIn && isAuthRoute) return '/';
      return null;
    },
    routes: [
      // Customer shell with the bottom navigation (Home, Search, Orders, Account)
      ShellRoute(
        builder: (context, state, child) => MainScaffold(child: child),
        routes: [
          GoRoute(path: '/', builder: (c, s) => const HomeScreen()),
          GoRoute(
            path: '/search',
            builder: (c, s) => SearchScreen(initialQuery: s.uri.queryParameters['q'] ?? ''),
          ),
          GoRoute(path: '/orders', builder: (c, s) => const OrdersScreen()),
          GoRoute(path: '/account', builder: (c, s) => const AccountScreen()),
        ],
      ),

      // Cart opens full screen from the app-bar cart icon
      GoRoute(path: '/cart', builder: (c, s) => const CartScreen()),

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
      // Upload a prescription any time (Sprint 25); signed-in only via the /account prefix
      GoRoute(path: '/account/prescriptions', builder: (c, s) => const PrescriptionsScreen()),
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
      // Saved addresses ('/new' before '/:id/edit')
      GoRoute(path: '/account/addresses', builder: (c, s) => const AddressListScreen()),
      GoRoute(path: '/account/addresses/new', builder: (c, s) => const AddressFormScreen()),
      GoRoute(
        path: '/account/addresses/:id/edit',
        builder: (c, s) => AddressFormScreen(addressId: s.pathParameters['id']!),
      ),
      // Returns and refunds (C-37)
      GoRoute(path: '/account/returns', builder: (c, s) => const ReturnsScreen()),
      GoRoute(
        path: '/account/returns/new',
        builder: (c, s) => NewReturnScreen(
          orderId: s.uri.queryParameters['orderId'] ?? '',
          shipmentId: s.uri.queryParameters['shipmentId'] ?? '',
        ),
      ),
      GoRoute(
        path: '/account/returns/:id',
        builder: (c, s) => ReturnDetailScreen(returnId: s.pathParameters['id']!),
      ),
      // Side-effect reports (C-29)
      GoRoute(path: '/account/side-effects', builder: (c, s) => const SideEffectListScreen()),
      GoRoute(
        path: '/account/side-effects/new',
        builder: (c, s) => NewSideEffectScreen(
          productId: s.uri.queryParameters['productId'] ?? '',
          productName: s.uri.queryParameters['productName'],
          orderId: s.uri.queryParameters['orderId'],
        ),
      ),
      // Statutory disclosures and policies — public, no sign-in needed (C-04, C-39)
      GoRoute(path: '/legal', builder: (c, s) => const LegalScreen()),
      GoRoute(
        path: '/policies/:key',
        // ?lang=mr|hi opens the Marathi / Hindi text where published (C-40)
        builder: (c, s) => PolicyScreen(
          policyKey: s.pathParameters['key']!,
          initialLanguage: s.uri.queryParameters['lang'] ?? 'en',
        ),
      ),
      // Teleconsultation (Telemedicine Practice Guidelines 2020; C-22..C-24).
      // The doctor directory is public; booking and everything under
      // /consultations needs sign-in. '/book' and '/prescriptions/:id' are
      // listed before '/:id/join'.
      GoRoute(path: '/doctors', builder: (c, s) => const DoctorListScreen()),
      GoRoute(
        path: '/doctors/:id',
        builder: (c, s) => DoctorDetailScreen(doctorId: s.pathParameters['id']!),
      ),
      GoRoute(path: '/consultations', builder: (c, s) => const MyConsultationsScreen()),
      GoRoute(
        path: '/consultations/book',
        builder: (c, s) => BookConsultationScreen(
          doctorId: s.uri.queryParameters['doctorId'] ?? '',
          slotId: s.uri.queryParameters['slotId'] ?? '',
          date: s.uri.queryParameters['date'],
          start: s.uri.queryParameters['start'],
        ),
      ),
      GoRoute(
        path: '/consultations/prescriptions/:id',
        builder: (c, s) => EPrescriptionScreen(
          prescriptionId: s.pathParameters['id']!,
          orderId: s.uri.queryParameters['orderId'],
        ),
      ),
      GoRoute(
        path: '/consultations/:id/join',
        builder: (c, s) => JoinConsultationScreen(consultationId: s.pathParameters['id']!),
      ),
      // In-app audio/video call (Mobile Sprint 14, C-23: patient and doctor only, not recorded)
      GoRoute(
        path: '/consultations/:id/call',
        // The doctor's list passes the join details it already fetched as
        // `extra` (Sprint 15); without them the screen asks the server.
        builder: (c, s) => VideoCallScreen(
          consultationId: s.pathParameters['id']!,
          initialJoin: s.extra is ConsultJoin ? s.extra as ConsultJoin : null,
        ),
      ),
      GoRoute(path: '/doctor/portal', builder: (c, s) => const DoctorPortalScreen()),
      // The doctor's consultations for a day, with Join / End (Mobile Sprint 15; C-22, C-23)
      GoRoute(path: '/doctor/consultations', builder: (c, s) => const DoctorConsultationsScreen()),
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
