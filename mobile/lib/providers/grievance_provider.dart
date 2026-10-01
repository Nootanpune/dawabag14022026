import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/grievance.dart';
import '../services/api_service.dart';
import '../services/grievance_api.dart';
import 'auth_provider.dart';

/// In-memory mirror of the buyer's complaints (C-36). Nothing is stored on
/// the device; every action is a request followed by a reload.
class GrievanceListState {
  final List<Grievance> grievances;
  final bool isLoading;
  final bool loaded;
  final String? error;

  const GrievanceListState({
    this.grievances = const [],
    this.isLoading = false,
    this.loaded = false,
    this.error,
  });
}

class GrievanceNotifier extends StateNotifier<GrievanceListState> {
  GrievanceNotifier() : super(const GrievanceListState());

  /// Bumped on sign-out so late responses for the old session are ignored.
  int _generation = 0;

  void reset() {
    _generation++;
    state = const GrievanceListState();
  }

  /// GET /grievances
  Future<void> load() async {
    final gen = _generation;
    state = GrievanceListState(
      grievances: state.grievances,
      isLoading: true,
      loaded: state.loaded,
      error: state.error,
    );
    try {
      final list = await apiService.getGrievances();
      if (!mounted || gen != _generation) return;
      state = GrievanceListState(grievances: list, loaded: true);
    } catch (e) {
      if (!mounted || gen != _generation) return;
      state = GrievanceListState(
        grievances: state.grievances,
        loaded: true,
        error: ApiService.errorMessage(e, fallback: 'Could not load your complaints'),
      );
    }
  }

  /// POST /grievances. Returns { id, ticket_no, status, created_at } on
  /// success; throws the API error otherwise (the form shows the message).
  Future<Map<String, dynamic>> create({
    required String category,
    required String subject,
    required String description,
    String? orderId,
  }) async {
    final created = await apiService.createGrievance(
      category: category,
      subject: subject,
      description: description,
      orderId: orderId,
    );
    await load();
    return created;
  }
}

final grievanceProvider =
    StateNotifierProvider<GrievanceNotifier, GrievanceListState>((ref) {
  final notifier = GrievanceNotifier();
  ref.listen<bool>(
    authProvider.select((s) => s.isAuthenticated),
    (previous, isAuthenticated) {
      if (!isAuthenticated) notifier.reset();
    },
  );
  return notifier;
});

/// GET /grievances/:id — refetched whenever the screen opens (autoDispose).
final grievanceDetailProvider =
    FutureProvider.autoDispose.family<Grievance, String>((ref, id) {
  return apiService.getGrievance(id);
});
