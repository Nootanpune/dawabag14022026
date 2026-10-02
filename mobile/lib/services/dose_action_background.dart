import 'package:dio/dio.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../config/api_url.dart';
import 'dose_actions.dart';
import 'local_notifications.dart';
import 'session_store.dart';

/// "Taken" / "Skip" pressed on a dose alert while the app is closed or in the
/// background (Sprint 34). The notification plugin starts a small background
/// copy of the app and calls this. It signs in with the keychain refresh token
/// (the only thing the app keeps, standing rule), sends the answer to the server
/// and stops. Nothing else is read or written on the phone.
///
/// If the answer cannot be sent (no network, signed out), a new alert — still
/// without the medicine's name (C-41) — asks to open My medicines, where that
/// dose is highlighted.
@pragma('vm:entry-point')
Future<void> doseActionInBackground(NotificationResponse response) async {
  final status = doseStatusForAction(response.actionId);
  final dose = parseDosePayload(response.payload);
  if (status == null || dose == null) return;
  final store = SessionStore();
  final client = BackgroundDoseClient(
    dio: Dio(BaseOptions(
      baseUrl: '${apiBaseUrl()}/api/v1',
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      headers: {'Content-Type': 'application/json'},
    )),
    readRefreshToken: store.readRefreshToken,
    writeRefreshToken: store.writeRefreshToken,
  );
  bool saved;
  try {
    saved = await client.answer(dose, status);
  } catch (_) {
    saved = false;
  }
  if (!saved) await LocalNotifications.showAnswerNotSaved(dose);
}

/// Signs in with the refresh token and sends the answer. Separate from the
/// app's ApiService on purpose: a failure here must never delete the keychain
/// token (the open app may have just rotated it) — the app's own start-up
/// decides whether the session is over.
class BackgroundDoseClient {
  final Dio dio;
  final Future<String?> Function() readRefreshToken;
  final Future<void> Function(String token) writeRefreshToken;

  BackgroundDoseClient({required this.dio, required this.readRefreshToken, required this.writeRefreshToken});

  /// True when every dose in the alert was saved on the server.
  Future<bool> answer(DoseRef dose, String status) async {
    final refresh = await readRefreshToken();
    if (refresh == null || refresh.isEmpty) return false;
    // POST /auth/refresh rotates the refresh token: store the new one at once (keychain only)
    final Response<dynamic> res;
    try {
      res = await dio.post('/auth/refresh', data: {'refresh_token': refresh});
    } on DioException {
      return false; // offline or signed out: the token is left as it is
    }
    final data = res.data is Map ? (res.data as Map)['data'] : null;
    final access = data is Map ? data['access_token'] : null;
    if (access is! String || access.isEmpty) return false;
    final rotated = data['refresh_token'];
    if (rotated is String && rotated.isNotEmpty) await writeRefreshToken(rotated);
    final auth = Options(headers: {'Authorization': 'Bearer $access'});
    return answerDoseAlert(
      (id, at, s) => dio.post('/reminders/${Uri.encodeComponent(id)}/doses',
          data: {'scheduled_for': at, 'status': s}, options: auth),
      dose,
      status,
    );
  }
}
