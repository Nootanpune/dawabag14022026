import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The ONLY thing the app keeps on the device: the refresh token, in the OS
/// keychain / keystore (owner rule: the server is the single source of truth).
/// The access token and all account data live in memory only.
class SessionStore {
  static const String _refreshKey = 'refresh_token';
  static const String _legacyAccessKey = 'access_token';

  final FlutterSecureStorage _storage = const FlutterSecureStorage();

  Future<String?> readRefreshToken() => _storage.read(key: _refreshKey);

  Future<void> writeRefreshToken(String token) =>
      _storage.write(key: _refreshKey, value: token);

  Future<void> deleteRefreshToken() => _storage.delete(key: _refreshKey);

  /// Older builds also stored the access token; remove it if present.
  Future<void> deleteLegacyEntries() => _storage.delete(key: _legacyAccessKey);
}
