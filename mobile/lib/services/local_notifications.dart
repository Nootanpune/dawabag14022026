import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'api_service.dart';
import 'dose_action_background.dart';
import 'dose_actions.dart';
import 'notification_tap_router.dart';
import 'reminder_api.dart';

/// The one set-up of the phone's notification plugin (Sprint 34), shared by
/// order pushes shown in the foreground and the dose alerts. One set-up matters:
/// a second `initialize` would replace the tap handlers and the iOS categories.
///
/// Dose alerts carry "Taken" and "Skip" (iOS: the [kDoseCategoryId] category).
/// Pressed while the app is closed, [doseActionInBackground] sends the answer;
/// pressed while it is open, [handleResponse] sends it with the app's session.
class LocalNotifications {
  LocalNotifications._();

  static final FlutterLocalNotificationsPlugin plugin = FlutterLocalNotificationsPlugin();
  static Future<void>? _ready;
  static bool _askedPermission = false;

  /// Called after "Taken" / "Skip" was saved from an alert while the app is
  /// open, so My medicines reloads from the server.
  static void Function()? onDoseAnswered;

  /// Shown when an answer from the alert could not be sent.
  static const int kAnswerNotSavedId = 700099;

  /// iOS: the actions must be registered before the first alert. Unlocking is
  /// required, so nobody can answer for the user from a locked phone and the
  /// keychain (where the session lives) can be read.
  static final DarwinNotificationCategory doseCategory = DarwinNotificationCategory(
    kDoseCategoryId,
    actions: <DarwinNotificationAction>[
      DarwinNotificationAction.plain(kDoseActionTaken, 'Taken',
          options: <DarwinNotificationActionOption>{DarwinNotificationActionOption.authenticationRequired}),
      DarwinNotificationAction.plain(kDoseActionSkip, 'Skip',
          options: <DarwinNotificationActionOption>{DarwinNotificationActionOption.authenticationRequired}),
    ],
  );

  /// Permission is NOT asked at start-up; [requestPermission] asks when the
  /// user has reminders to be alerted about.
  static InitializationSettings get settings => InitializationSettings(
        android: const AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
          notificationCategories: <DarwinNotificationCategory>[doseCategory],
        ),
      );

  static Future<void> ensureInitialized() => _ready ??= _initialize();

  static Future<void> _initialize() async {
    await plugin.initialize(
      settings,
      onDidReceiveNotificationResponse: handleResponse,
      onDidReceiveBackgroundNotificationResponse: doseActionInBackground,
    );
  }

  /// The app was opened by tapping one of our alerts (cold start).
  static Future<void> openLaunchNotification() async {
    final launch = await plugin.getNotificationAppLaunchDetails();
    final response = launch?.notificationResponse;
    if (launch != null && launch.didNotificationLaunchApp && response != null) await handleResponse(response);
  }

  /// A tap or an action button while the app runs: "Taken" / "Skip" go to the
  /// server; if that fails (or for a plain tap) My medicines opens with the dose
  /// highlighted. Any other alert is an order (Sprint 8).
  static Future<void> handleResponse(NotificationResponse response) async {
    final status = doseStatusForAction(response.actionId);
    final dose = parseDosePayload(response.payload);
    if (dose != null && status != null) {
      final saved = await answerDoseAlert((id, at, s) => apiService.logDose(id, at, s), dose, status);
      if (saved) {
        onDoseAnswered?.call();
        return;
      }
    }
    NotificationTapRouter.openLocalPayload(response.payload);
  }

  /// Android 13+ and iOS ask the user once; later calls do nothing.
  static Future<void> requestPermission() async {
    if (_askedPermission) return;
    _askedPermission = true;
    await plugin.resolvePlatformSpecificImplementation<AndroidFlutterLocalNotificationsPlugin>()?.requestNotificationsPermission();
    await plugin
        .resolvePlatformSpecificImplementation<IOSFlutterLocalNotificationsPlugin>()
        ?.requestPermissions(alert: true, badge: false, sound: true);
  }

  /// From the background handler: the answer did not reach the server. Still
  /// no medicine name (C-41); the tap opens My medicines on that dose.
  static Future<void> showAnswerNotSaved(DoseRef dose) async {
    try {
      await ensureInitialized();
      await plugin.show(
        kAnswerNotSavedId,
        'Your answer was not saved',
        'Open My medicines to mark this dose.',
        const NotificationDetails(
          android: AndroidNotificationDetails(kDoseChannelId, kDoseChannelName,
              channelDescription: kDoseChannelDescription, visibility: NotificationVisibility.private),
          iOS: DarwinNotificationDetails(),
        ),
        payload: dosePayload(dose.reminderIds, dose.at ?? DateTime.now()),
      );
    } catch (_) {
      // Nothing more to do: the dose still shows in My medicines.
    }
  }
}

const String kDoseChannelId = 'dawabag_doses';
const String kDoseChannelName = 'Medicine reminders';
const String kDoseChannelDescription = 'Reminders you set in My medicines';
