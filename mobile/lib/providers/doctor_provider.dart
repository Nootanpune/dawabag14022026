import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/doctor.dart';
import '../services/api_service.dart';
import '../services/doctor_api.dart';

/// In-memory view of the public doctor directory (C-22). Nothing is stored
/// on the device; the list is fetched each time the screen opens.
class DoctorListState {
  final List<Doctor> doctors;
  final String? speciality;
  final int page;
  final bool hasMore;
  final bool isLoading;
  final bool loaded;
  final String? error;

  const DoctorListState({
    this.doctors = const [],
    this.speciality,
    this.page = 0,
    this.hasMore = false,
    this.isLoading = false,
    this.loaded = false,
    this.error,
  });
}

class DoctorListNotifier extends StateNotifier<DoctorListState> {
  DoctorListNotifier() : super(const DoctorListState());

  /// Bumped on every fresh load so a slow older response is ignored.
  int _generation = 0;

  /// GET /doctors?speciality&page=1 (replaces the list).
  Future<void> load({String? speciality}) async {
    final gen = ++_generation;
    state = DoctorListState(
      doctors: state.speciality == speciality ? state.doctors : const [],
      speciality: speciality,
      isLoading: true,
      loaded: state.loaded && state.speciality == speciality,
    );
    try {
      final list = await apiService.getDoctors(speciality: speciality, page: 1);
      if (!mounted || gen != _generation) return;
      state = DoctorListState(
        doctors: list,
        speciality: speciality,
        page: 1,
        hasMore: list.length >= kDoctorPageSize,
        loaded: true,
      );
    } catch (e) {
      if (!mounted || gen != _generation) return;
      state = DoctorListState(
        doctors: state.doctors,
        speciality: speciality,
        loaded: true,
        error: ApiService.errorMessage(e, fallback: 'Could not load doctors'),
      );
    }
  }

  /// Same query again (pull to refresh / retry).
  Future<void> reload() => load(speciality: state.speciality);

  /// GET /doctors?speciality&page=n+1 (appends).
  Future<void> loadMore() async {
    if (state.isLoading || !state.hasMore) return;
    final gen = _generation;
    final current = state;
    state = DoctorListState(
      doctors: current.doctors,
      speciality: current.speciality,
      page: current.page,
      hasMore: current.hasMore,
      isLoading: true,
      loaded: true,
    );
    try {
      final next = await apiService.getDoctors(speciality: current.speciality, page: current.page + 1);
      if (!mounted || gen != _generation) return;
      state = DoctorListState(
        doctors: [...current.doctors, ...next],
        speciality: current.speciality,
        page: current.page + 1,
        hasMore: next.length >= kDoctorPageSize,
        loaded: true,
      );
    } catch (e) {
      if (!mounted || gen != _generation) return;
      state = DoctorListState(
        doctors: current.doctors,
        speciality: current.speciality,
        page: current.page,
        hasMore: current.hasMore,
        loaded: true,
        error: ApiService.errorMessage(e, fallback: 'Could not load more doctors'),
      );
    }
  }
}

final doctorListProvider =
    StateNotifierProvider.autoDispose<DoctorListNotifier, DoctorListState>(
        (ref) => DoctorListNotifier());

/// GET /doctors/:id — refetched whenever a screen opens (autoDispose).
final doctorDetailProvider =
    FutureProvider.autoDispose.family<Doctor, String>((ref, id) {
  return apiService.getDoctor(id);
});

/// Key for [doctorSlotsProvider]: the doctor and the day ('YYYY-MM-DD').
typedef DoctorSlotQuery = ({String doctorId, String date});

/// GET /doctors/:id/slots?date= — open slots for one day, never cached.
final doctorSlotsProvider =
    FutureProvider.autoDispose.family<List<DoctorSlot>, DoctorSlotQuery>((ref, q) {
  return apiService.getDoctorSlots(q.doctorId, q.date);
});
