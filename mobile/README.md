# Dawabag mobile app (Flutter)

Buyer and doctor app for the Dawabag online pharmacy. The server is the only record:
the app stores nothing on the device except the sign-in token in the OS keychain.

## Build

    flutter pub get
    flutter build apk --debug \
      --dart-define=API_URL=https://api.example.in \
      --dart-define=FIREBASE_API_KEY=... --dart-define=FIREBASE_APP_ID=... \
      --dart-define=FIREBASE_SENDER_ID=... --dart-define=FIREBASE_PROJECT_ID=...   # optional: push

Without the Firebase values the app runs with push notifications off. CI builds a debug
APK on every push (GitHub Actions → CI → mobile → artifact `dawabag-debug-apk`).

Release builds need a signing key (`android/key.properties`, never committed) and the
store listing; see docs/RUNBOOK.md.
