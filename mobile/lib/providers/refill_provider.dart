import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/refill.dart';
import '../services/api_service.dart';
import '../services/refill_api.dart';
import 'auth_provider.dart';

/// In-memory mirror of the server's refill subscriptions and payment
/// mandates. Nothing is stored on the device (server is the single source of
/// truth); every action is a request followed by a reload from the server.
class RefillState {
  final List<Refill> refills;
  final List<PaymentMandate> mandates;
  final bool isLoading;
  final bool isUpdating;
  final bool loaded;
  final String? error;

  const RefillState({
    this.refills = const [],
    this.mandates = const [],
    this.isLoading = false,
    this.isUpdating = false,
    this.loaded = false,
    this.error,
  });

  List<PaymentMandate> get activeMandates => mandates.where((m) => m.isActive).toList();

  RefillState copyWith({
    List<Refill>? refills,
    List<PaymentMandate>? mandates,
    bool? isLoading,
    bool? isUpdating,
    bool? loaded,
    String? error,
  }) =>
      RefillState(
        refills: refills ?? this.refills,
        mandates: mandates ?? this.mandates,
        isLoading: isLoading ?? this.isLoading,
        isUpdating: isUpdating ?? this.isUpdating,
        loaded: loaded ?? this.loaded,
        error: error,
      );
}

class RefillNotifier extends StateNotifier<RefillState> {
  RefillNotifier() : super(const RefillState());

  /// Bumped on sign-out so late responses for the old session are ignored.
  int _generation = 0;

  void reset() {
    _generation++;
    state = const RefillState();
  }

  /// GET /refills + GET /refills/mandates/list
  Future<void> load() async {
    final gen = _generation;
    state = state.copyWith(isLoading: true, error: state.error);
    try {
      final results = await Future.wait<Object>([
        apiService.getRefills(),
        apiService.getMandates(),
      ]);
      if (!mounted || gen != _generation) return;
      state = RefillState(
        refills: results[0] as List<Refill>,
        mandates: results[1] as List<PaymentMandate>,
        loaded: true,
      );
    } catch (e) {
      if (!mounted || gen != _generation) return;
      state = state.copyWith(
        isLoading: false,
        loaded: true,
        error: ApiService.errorMessage(e, fallback: 'Could not load your refills'),
      );
    }
  }

  /// Runs an action, then reloads from the server. Returns an error message,
  /// or null on success.
  Future<String?> _act(Future<void> Function() call, String fallback) async {
    final gen = _generation;
    state = state.copyWith(isUpdating: true, error: state.error);
    String? message;
    try {
      await call();
    } catch (e) {
      message = ApiService.errorMessage(e, fallback: fallback);
    }
    if (!mounted || gen != _generation) return message;
    await load();
    if (mounted && gen == _generation) state = state.copyWith(isUpdating: false, error: state.error);
    return message;
  }

  /// POST /refills (from a delivered order)
  Future<String?> create(String orderId, int frequencyDays) => _act(
        () => apiService.createRefill(orderId, frequencyDays),
        'Could not set up the refill',
      );

  /// PATCH is_active (pause / resume)
  Future<String?> setActive(String id, bool isActive) => _act(
        () => apiService.updateRefill(id, isActive: isActive),
        isActive ? 'Could not resume the refill' : 'Could not pause the refill',
      );

  /// PATCH frequency_days (7–180)
  Future<String?> setFrequency(String id, int days) => _act(
        () => apiService.updateRefill(id, frequencyDays: days),
        'Could not change how often this refill repeats',
      );

  /// PATCH items (absolute quantities; 0 removes)
  Future<String?> setItems(String id, List<RefillItem> items) => _act(
        () => apiService.updateRefill(id, items: items),
        'Could not update the refill items',
      );

  /// PATCH mandate_id (attach an active mandate, or null to turn off)
  Future<String?> setMandate(String id, String? mandateId) => _act(
        () => apiService.updateRefill(id, mandateId: mandateId, clearMandate: mandateId == null),
        'Could not change automatic payment for this refill',
      );

  /// DELETE /refills/:id
  Future<String?> cancel(String id) =>
      _act(() => apiService.cancelRefill(id), 'Could not cancel the refill');

  /// DELETE /refills/mandates/:id
  Future<String?> cancelMandate(String id) =>
      _act(() => apiService.cancelMandate(id), 'Could not turn off automatic payment');

  /// Reload after a mandate was started (it turns active once the bank and
  /// Razorpay confirm, on the server).
  Future<void> refresh() => load();
}

final refillProvider = StateNotifierProvider<RefillNotifier, RefillState>((ref) {
  final notifier = RefillNotifier();
  ref.listen<bool>(
    authProvider.select((s) => s.isAuthenticated),
    (previous, isAuthenticated) {
      if (!isAuthenticated) notifier.reset();
    },
  );
  return notifier;
});
