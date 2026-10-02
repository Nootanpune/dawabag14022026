import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'config/firebase_config.dart';
import 'config/router.dart';
import 'config/theme.dart';
import 'providers/auth_provider.dart';
import 'providers/reminder_provider.dart';
import 'services/local_notifications.dart';
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

  // Sprint 34: dose alerts (Taken / Skip) work without Firebase too; a tap that
  // opened the app is routed once the session is restored.
  try {
    await LocalNotifications.ensureInitialized();
    await LocalNotifications.openLaunchNotification();
  } catch (_) {
    // Alerts are a convenience; My medicines shows every dose from the server.
  }

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
    // Sprint 33: dose alerts are (re)set from the server's list on start and sign-in
    ref.read(doseAlarmSyncProvider);
    // Sprint 34: "Taken" / "Skip" answered from an alert while the app is open
    LocalNotifications.onDoseAnswered = () {
      ref.invalidate(remindersProvider);
      ref.read(doseAlarmSyncProvider).sync();
    };
  }

  @override
  Widget build(BuildContext context) {
    final router = ref.watch(routerProvider);
    NotificationTapRouter.attach(router);

    return MaterialApp.router(
      title: 'DAWA BAG',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: ThemeMode.system,
      routerConfig: router,
    );
  }
}
