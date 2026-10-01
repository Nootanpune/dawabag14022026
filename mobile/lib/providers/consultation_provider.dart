import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/consultation.dart';
import '../models/eprescription.dart';
import '../services/api_service.dart';
import '../services/consultation_api.dart';
import 'auth_provider.dart';

/// In-memory mirror of the patient's teleconsultations (C-22, C-23). Nothing
/// is stored on the device; every action is a request followed by a reload.
class MyConsultationsState {
  final List<Consultation> consultations;
  final bool isLoading;
  final bool loaded;
  final String? error;

  const MyConsultationsState({
    this.consultations = const [],
    this.isLoading = false,
    this.loaded = false,
    this.error,
  });
}

class MyConsultationsNotifier extends StateNotifier<MyConsultationsState> {
  MyConsultationsNotifier() : super(const MyConsultationsState());

  /// Bumped on sign-out so late responses for the old session are ignored.
  int _generation = 0;

  void reset() {
    _generation++;
    state = const MyConsultationsState();
  }

  /// GET /consultations/my
  Future<void> load() async {
    final gen = _generation;
    state = MyConsultationsState(
      consultations: state.consultations,
      isLoading: true,
      loaded: state.loaded,
      error: state.error,
    );
    try {
      final list = await apiService.getMyConsultations();
      if (!mounted || gen != _generation) return;
      state = MyConsultationsState(consultations: list, loaded: true);
    } catch (e) {
      if (!mounted || gen != _generation) return;
      state = MyConsultationsState(
        consultations: state.consultations,
        loaded: true,
        error: ApiService.errorMessage(e, fallback: 'Could not load your consultations'),
      );
    }
  }

  /// POST /consultations/:id/cancel, then reload. Returns the server's
  /// response ({ id, status, refund }); throws the API error otherwise.
  Future<Map<String, dynamic>> cancel(String id, String reason) async {
    final result = await apiService.cancelConsultation(id, reason);
    await load();
    return result;
  }
}

final myConsultationsProvider =
    StateNotifierProvider<MyConsultationsNotifier, MyConsultationsState>((ref) {
  final notifier = MyConsultationsNotifier();
  ref.listen<bool>(
    authProvider.select((s) => s.isAuthenticated),
    (previous, isAuthenticated) {
      if (!isAuthenticated) notifier.reset();
    },
  );
  return notifier;
});

/// GET /consultations/prescriptions/:id — refetched whenever the screen
/// opens (autoDispose).
final ePrescriptionProvider =
    FutureProvider.autoDispose.family<EPrescription, String>((ref, id) {
  return apiService.getEPrescription(id);
});

/// GET /consultations/:id/join — asked each time the join screen opens; the
/// server refuses (402 unpaid, 409 too early or closed) with a message.
final consultJoinProvider =
    FutureProvider.autoDispose.family<ConsultJoin, String>((ref, id) {
  return apiService.joinConsultation(id);
});
