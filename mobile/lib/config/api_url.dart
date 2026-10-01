import 'package:flutter/foundation.dart';

/// API address, fixed at build time: `--dart-define=API_URL=https://api.dawabag.in`.
/// Without it a debug build talks to the Android emulator's host.
const String _apiUrl = String.fromEnvironment('API_URL', defaultValue: 'http://10.0.2.2:4000');

/// The API base address this build uses. A release build refuses anything but
/// https: Flutter's HTTP client does not apply Android's cleartext block, so a
/// release built without API_URL (or with an http one) would otherwise send
/// passwords, OTPs, tokens and prescriptions in clear text (C-41).
String apiBaseUrl({String url = _apiUrl, bool release = kReleaseMode}) {
  final uri = Uri.tryParse(url);
  if (release && (uri == null || uri.scheme != 'https' || uri.host.isEmpty)) {
    throw StateError('Release builds need an https API address: build with --dart-define=API_URL=https://…');
  }
  return url;
}
