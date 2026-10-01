import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

// Firebase (push notifications only) is configured at build time:
//   flutter build apk --dart-define=FIREBASE_API_KEY=... --dart-define=FIREBASE_APP_ID=...
//     --dart-define=FIREBASE_SENDER_ID=... --dart-define=FIREBASE_PROJECT_ID=...
// Values come from the Firebase console (Project settings → Your apps). Nothing is
// read from or written to the device. Without them the app runs normally and only
// push notifications are off (order updates still arrive by SMS and in the inbox).
const _apiKey = String.fromEnvironment('FIREBASE_API_KEY');
const _appId = String.fromEnvironment('FIREBASE_APP_ID');
const _senderId = String.fromEnvironment('FIREBASE_SENDER_ID');
const _projectId = String.fromEnvironment('FIREBASE_PROJECT_ID');

bool get firebaseConfigured => _apiKey.isNotEmpty && _appId.isNotEmpty && _senderId.isNotEmpty && _projectId.isNotEmpty;

/// Starts Firebase when it is configured; returns whether it is running.
Future<bool> startFirebase() async {
  if (!firebaseConfigured) {
    debugPrint('Firebase not configured: push notifications are off');
    return false;
  }
  try {
    await Firebase.initializeApp(
      options: const FirebaseOptions(apiKey: _apiKey, appId: _appId, messagingSenderId: _senderId, projectId: _projectId),
    );
    return true;
  } catch (e) {
    debugPrint('Firebase did not start ($e): push notifications are off');
    return false;
  }
}
