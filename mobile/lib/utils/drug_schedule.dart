// Drug schedule display helpers (the server enforces every schedule rule).
// Values: 'OTC', 'Non-scheduled', 'Schedule G', 'Schedule H', 'Schedule H1',
// 'Schedule X', 'NDPS'. 'Non-scheduled' (Sprint 31) is in no schedule: no
// prescription needed and sold online — not the same as OTC.
// Mirrors frontend-web/src/lib/drugSchedule.ts.

String _norm(String? schedule) => (schedule ?? '').trim().toUpperCase();

/// Schedule H1 (C-09 register), written 'Schedule H1' or 'H1'.
bool isScheduleH1(String? schedule) {
  final s = _norm(schedule);
  return s == 'SCHEDULE H1' || s == 'H1';
}

/// Patients need a prescription (Schedule H / H1, C-08).
bool isRxSchedule(String? schedule) {
  final s = _norm(schedule);
  return s == 'SCHEDULE H' || s == 'H' || isScheduleH1(schedule);
}

/// Never sold online (Schedule X / NDPS, C-10).
bool isNeverOnline(String? schedule) {
  final s = _norm(schedule);
  return s == 'SCHEDULE X' || s == 'X' || s == 'NDPS';
}

/// In no schedule (Sprint 31).
bool isNonScheduled(String? schedule) => _norm(schedule).replaceAll(RegExp(r'[\s-]'), '') == 'NONSCHEDULED';

/// Worth pointing out on an order line: any schedule except OTC / Non-scheduled.
bool isNotableSchedule(String? schedule) {
  final s = _norm(schedule);
  return s.isNotEmpty && s != 'OTC' && !isNonScheduled(schedule);
}

/// Short badge text for lists: "Rx" for Schedule H / H1 (C-08), "Non-scheduled",
/// or null (OTC and the rest show no badge in a short list).
String? scheduleListBadge(String? schedule) {
  if (isRxSchedule(schedule)) return 'Rx';
  if (isNonScheduled(schedule)) return 'Non-scheduled';
  return null;
}
