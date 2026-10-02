// "Taken" and "Skip" on a dose alert (Sprint 34).
//
// The alert carries only reminder ids and the dose time in its payload — never
// the medicine's name, which would show on the lock screen (C-41). The answer
// goes straight to the server (POST /reminders/:id/doses, the same call as the
// My medicines screen); nothing is kept on the phone. When the answer cannot be
// sent, My medicines opens with that dose highlighted so it can be marked there.

const String kDosePayloadPrefix = 'dose:';

/// Action ids on the alert (Android actions and the iOS category's actions).
const String kDoseActionTaken = 'dose_taken';
const String kDoseActionSkip = 'dose_skip';

/// iOS notification category that carries the two actions.
const String kDoseCategoryId = 'dawabag_dose';

/// One alert: the reminders due at that minute and the dose time.
class DoseRef {
  final List<String> reminderIds;
  /// ISO instant in UTC, exactly as the server sent it (e.g. 2026-10-05T14:30:00.000Z)
  final String scheduledFor;
  const DoseRef({required this.reminderIds, required this.scheduledFor});

  DateTime? get at => DateTime.tryParse(scheduledFor);
}

/// 'dose:r1,r2@2026-10-05T14:30:00.000Z'
String dosePayload(List<String> reminderIds, DateTime at) =>
    '$kDosePayloadPrefix${reminderIds.join(',')}@${at.toUtc().toIso8601String()}';

bool isDosePayload(String? payload) => payload != null && payload.startsWith(kDosePayloadPrefix);

/// Reads an alert's payload; null when it is not a dose alert or is damaged.
DoseRef? parseDosePayload(String? payload) {
  if (!isDosePayload(payload)) return null;
  final body = payload!.substring(kDosePayloadPrefix.length);
  final at = body.lastIndexOf('@');
  if (at <= 0) return null;
  final ids = body.substring(0, at).split(',').map((s) => s.trim()).where((s) => s.isNotEmpty).toSet().toList();
  final when = body.substring(at + 1);
  if (ids.isEmpty || DateTime.tryParse(when) == null) return null;
  return DoseRef(reminderIds: ids, scheduledFor: when);
}

/// 'taken' / 'skipped' for an action button; null for a plain tap.
String? doseStatusForAction(String? actionId) => switch (actionId) {
      kDoseActionTaken => 'taken',
      kDoseActionSkip => 'skipped',
      _ => null,
    };

/// My medicines with the alert's dose highlighted.
String myMedicinesLocation([DoseRef? dose]) {
  if (dose == null) return '/account/medicines';
  return Uri(path: '/account/medicines', queryParameters: {
    'dose': dose.reminderIds.join(','),
    'at': dose.scheduledFor,
  }).toString();
}

/// The highlight asked for by `/account/medicines?dose=…&at=…`, if any.
DoseRef? doseFromQuery(Map<String, String> query) {
  final ids = (query['dose'] ?? '').split(',').where((s) => s.isNotEmpty).toList();
  final at = query['at'];
  if (ids.isEmpty || at == null || DateTime.tryParse(at) == null) return null;
  return DoseRef(reminderIds: ids, scheduledFor: at);
}

/// Sends one dose's answer (POST /reminders/:id/doses).
typedef DoseAnswerSender = Future<void> Function(String reminderId, String scheduledFor, String status);

/// Sends the answer for every reminder in the alert. True only when all were
/// saved; a failure for one does not stop the others.
Future<bool> answerDoseAlert(DoseAnswerSender send, DoseRef dose, String status) async {
  var ok = true;
  for (final id in dose.reminderIds) {
    try {
      await send(id, dose.scheduledFor, status);
    } catch (_) {
      ok = false;
    }
  }
  return ok;
}
