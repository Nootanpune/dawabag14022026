import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/consultation.dart';
import '../models/doctor_consultation.dart';
import '../services/api_service.dart';
import '../services/consultation_api.dart';
import '../services/doctor_consultation_api.dart';
import '../utils/consult_format.dart';
import '../utils/ist.dart';
import 'auth_provider.dart';

/// Today's date in India time (slots are Asia/Kolkata), whatever the phone's
/// time zone is.
DateTime indiaToday() => todayIstDate();

/// In-memory mirror of the doctor's consultations for one day (Mobile Sprint
/// 15; C-22, C-23). Nothing is stored on the device; every action is a request
/// followed by a reload.
class DoctorConsultationsState {
  final DateTime day;
  final List<DoctorConsultation> consultations;
  final bool isLoading;
  final bool loaded;
  final String? error;

  const DoctorConsultationsState({
    required this.day,
    this.consultations = const [],
    this.isLoading = false,
    this.loaded = false,
    this.error,
  });
}

class DoctorConsultationsNotifier extends StateNotifier<DoctorConsultationsState> {
  DoctorConsultationsNotifier() : super(DoctorConsultationsState(day: indiaToday()));

  /// Bumped on sign-out and on every fresh load so late responses (old
  /// session, previous day) are ignored.
  int _generation = 0;

  void reset() {
    _generation++;
    state = DoctorConsultationsState(day: indiaToday());
  }

  /// GET /consultations/doctor?date= for [day] (default: the day shown).
  Future<void> load({DateTime? day}) async {
    final gen = ++_generation;
    final target = day ?? state.day;
    final sameDay = target == state.day;
    state = DoctorConsultationsState(
      day: target,
      consultations: sameDay ? state.consultations : const [],
      isLoading: true,
      loaded: sameDay && state.loaded,
    );
    try {
      final list = await apiService.getDoctorConsultations(slotQueryDate(target));
      if (!mounted || gen != _generation) return;
      state = DoctorConsultationsState(day: target, consultations: list, loaded: true);
    } catch (e) {
      if (!mounted || gen != _generation) return;
      state = DoctorConsultationsState(
        day: target,
        consultations: state.consultations,
        loaded: true,
        error: ApiService.errorMessage(e, fallback: 'Could not load your consultations'),
      );
    }
  }

  /// GET /consultations/:id/join as the doctor. The server refuses with its
  /// own message (402 fee unpaid, 409 too early / closed); the caller shows
  /// it. A successful join moves a booked consultation to in progress; the
  /// screen reloads the list when the call closes.
  Future<ConsultJoin> join(String id) => apiService.joinConsultation(id);

  /// POST /consultations/:id/end, then reload. Throws the API error.
  Future<void> end(String id, {String? notes}) async {
    await apiService.endConsultation(id, notes: notes);
    await load();
  }
}

final doctorConsultationsProvider =
    StateNotifierProvider<DoctorConsultationsNotifier, DoctorConsultationsState>((ref) {
  final notifier = DoctorConsultationsNotifier();
  ref.listen<bool>(
    authProvider.select((s) => s.isAuthenticated),
    (previous, isAuthenticated) {
      if (!isAuthenticated) notifier.reset();
    },
  );
  return notifier;
});
