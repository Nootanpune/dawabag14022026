import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/privacy.dart';
import '../services/api_service.dart';
import '../services/privacy_api.dart';
import 'auth_provider.dart';

/// In-memory view of the buyer's consent log (C-40..C-44). The server holds
/// the append-only record; nothing is stored on the device.
class PrivacyState {
  final PrivacyConsents? consents;
  final bool isLoading;
  final bool isUpdating;
  final String? error;

  const PrivacyState({this.consents, this.isLoading = false, this.isUpdating = false, this.error});

  PrivacyState copyWith({
    PrivacyConsents? consents,
    bool? isLoading,
    bool? isUpdating,
    String? error,
  }) =>
      PrivacyState(
        consents: consents ?? this.consents,
        isLoading: isLoading ?? this.isLoading,
        isUpdating: isUpdating ?? this.isUpdating,
        error: error,
      );
}

class PrivacyNotifier extends StateNotifier<PrivacyState> {
  PrivacyNotifier() : super(const PrivacyState());

  int _generation = 0;

  void reset() {
    _generation++;
    state = const PrivacyState();
  }

  /// GET /privacy/consents
  Future<void> load() async {
    final gen = _generation;
    state = state.copyWith(isLoading: true, error: state.error);
    try {
      final consents = await apiService.getConsents();
      if (!mounted || gen != _generation) return;
      state = PrivacyState(consents: consents);
    } catch (e) {
      if (!mounted || gen != _generation) return;
      state = state.copyWith(
        isLoading: false,
        error: ApiService.errorMessage(e, fallback: 'Could not load your privacy settings'),
      );
    }
  }

  /// PUT /privacy/consents/marketing (C-40 / C-42: marketing is opt-in and
  /// can be withdrawn as easily as it was given).
  /// Returns an error message, or null on success.
  Future<String?> setMarketing(bool granted) async {
    final gen = _generation;
    state = state.copyWith(isUpdating: true, error: state.error);
    try {
      final consents = await apiService.setMarketingConsent(granted);
      if (mounted && gen == _generation) state = PrivacyState(consents: consents);
      return null;
    } catch (e) {
      if (mounted && gen == _generation) state = state.copyWith(isUpdating: false, error: state.error);
      return ApiService.errorMessage(e, fallback: 'Could not update your choice');
    }
  }

  /// POST /privacy/requests (C-40..C-44; erasure keeps records the law
  /// requires, C-44). Returns an error
  /// message (including the server's 409 "already pending"), or null.
  Future<String?> request(String requestType, {String? details}) async {
    try {
      await apiService.createDataRequest(requestType, details: details);
      return null;
    } catch (e) {
      return ApiService.errorMessage(e, fallback: 'Could not send your request');
    }
  }
}

final privacyProvider = StateNotifierProvider<PrivacyNotifier, PrivacyState>((ref) {
  final notifier = PrivacyNotifier();
  ref.listen<bool>(
    authProvider.select((s) => s.isAuthenticated),
    (previous, isAuthenticated) {
      if (!isAuthenticated) notifier.reset();
    },
  );
  return notifier;
});
