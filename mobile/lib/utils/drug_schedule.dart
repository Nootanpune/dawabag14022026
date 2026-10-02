// Drug schedule display helpers (the server enforces every schedule rule).
// Values: 'OTC', 'Non-scheduled', 'Schedule G', 'Schedule H', 'Schedule H1',
// 'Schedule X', 'NDPS'. 'Non-scheduled' (Sprint 31) is in no schedule: no
// prescription needed and sold online — not the same as OTC.

/// Patients need a prescription (Schedule H / H1, C-08).
bool isRxSchedule(String? schedule) => schedule == 'Schedule H' || schedule == 'Schedule H1';

/// Never sold online (Schedule X / NDPS, C-10).
bool isNeverOnline(String? schedule) => schedule == 'Schedule X' || schedule == 'NDPS';

/// In no schedule (Sprint 31).
bool isNonScheduled(String? schedule) =>
    (schedule ?? '').trim().toUpperCase().replaceAll(RegExp(r'[\s-]'), '') == 'NONSCHEDULED';

/// Worth pointing out on an order line: any schedule except OTC / Non-scheduled.
bool isNotableSchedule(String? schedule) =>
    schedule != null && schedule.isNotEmpty && schedule != 'OTC' && !isNonScheduled(schedule);
