import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/health_profile.dart';
import '../services/api_service.dart';
import '../services/health_profile_api.dart';

/// Health profile (Sprint 33): the server's copy, fetched when the screen shows.
final healthProfileProvider = FutureProvider.autoDispose<HealthProfile>((ref) => apiService.getHealthProfile());
