import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config/firebase_config.dart';
import 'config/router.dart';
import 'config/theme.dart';
import 'providers/auth_provider.dart';
import 'services/notification_service.dart';
import 'services/notification_tap_router.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Lock to portrait
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  // Push notifications only when Firebase is configured for this build
  if (await startFirebase()) await NotificationService.init();

  runApp(const ProviderScope(child: DawabagApp()));
}

class DawabagApp extends ConsumerStatefulWidget {
  const DawabagApp({super.key});

  @override
  ConsumerState<DawabagApp> createState() => _DawabagAppState();
}

class _DawabagAppState extends ConsumerState<DawabagApp> {
  @override
  void initState() {
    super.initState();
    // Notification taps open the order only once the session is restored.
    ref.listenManual<bool>(
      authProvider.select((s) => s.isAuthenticated),
      (_, signedIn) => NotificationTapRouter.setSignedIn(signedIn),
      fireImmediately: true,
    );
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    NotificationTapRouter.attach(router);

    return MaterialApp.router(
      title: 'Dawabag',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
