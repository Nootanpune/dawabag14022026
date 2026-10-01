import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/utils/consult_format.dart';
import 'package:dawabag/utils/ist.dart';

// Sprint 20 — IST everywhere. These hold whatever zone the test machine runs
// in (try `TZ=America/New_York flutter test`).
void main() {
  group('toIst', () {
    test('20:00Z is 01:30 the next day in India', () {
      final ist = toIst(DateTime.utc(2026, 9, 30, 20, 0));
      expect([ist.year, ist.month, ist.day, ist.hour, ist.minute], [2026, 10, 1, 1, 30]);
    });

    test('a local DateTime is converted from its instant, not its fields', () {
      final instant = DateTime.utc(2026, 10, 1, 8, 35);
      expect(toIst(instant.toLocal()), toIst(instant));
    });
  });

  group('formatting', () {
    test('an instant at 20:00Z shows the next day', () {
      expect(formatDateIst('2026-09-30T20:00:00Z'), '01 Oct 2026');
      expect(formatDateTimeIst('2026-09-30T20:00:00Z'), '01 Oct 2026, 1:30 AM');
      expect(formatDateTimeIst('2026-10-01T08:35:00.000Z', zone: true), '01 Oct 2026, 2:05 PM IST');
      expect(formatTimeIst('2026-10-01T18:30:00Z'), '12:00 AM');
    });

    test('date-only strings are never shifted', () {
      expect(formatDateIst('2026-10-01'), '01 Oct 2026');
      expect(formatDateIst('2026-01-31'), '31 Jan 2026');
      expect(istCalendarDay('2026-10-01'), DateTime(2026, 10, 1));
      expect(consultDay('2026-10-01'), DateTime(2026, 10, 1));
    });

    test('a DATE sent as UTC midnight or as IST midnight keeps its day', () {
      expect(formatDateIst('2026-10-01T00:00:00.000Z'), '01 Oct 2026');
      expect(formatDateIst('2026-09-30T18:30:00.000Z'), '01 Oct 2026');
    });

    test('slot clock times', () {
      expect(formatClockTime('14:30:00'), '2:30 PM');
      expect(formatSlotTime('09:05', zone: true), '9:05 AM IST');
    });

    test('empty or bad values', () {
      expect(formatDateIst(null), '');
      expect(formatDateIst('not a date'), 'not a date');
      expect(formatDateTimeIst(''), '');
    });
  });

  group('today', () {
    test('todayIst matches the IST calendar day of now', () {
      final n = DateTime.now().toUtc().add(const Duration(hours: 5, minutes: 30));
      final expected = '${n.year.toString().padLeft(4, '0')}-${n.month.toString().padLeft(2, '0')}-${n.day.toString().padLeft(2, '0')}';
      expect(todayIst(), expected);
      expect(calendarDayToApi(todayIstDate()), expected);
    });

    test('isOnOrAfterTodayIst', () {
      expect(isOnOrAfterTodayIst(todayIst()), isTrue);
      expect(isOnOrAfterTodayIst('2000-01-01'), isFalse);
      expect(isOnOrAfterTodayIst(null), isFalse);
    });
  });
}
