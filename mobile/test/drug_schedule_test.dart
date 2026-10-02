import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/utils/drug_schedule.dart';

void main() {
  test('Non-scheduled needs no prescription and is sold online (Sprint 31)', () {
    expect(isRxSchedule('Non-scheduled'), isFalse);
    expect(isNeverOnline('Non-scheduled'), isFalse);
    expect(isNonScheduled('Non-scheduled'), isTrue);
    expect(isNonScheduled('non scheduled'), isTrue);
    expect(isNonScheduled('OTC'), isFalse);
    expect(isNotableSchedule('Non-scheduled'), isFalse);
  });
  test('the other schedules keep their meaning', () {
    expect(isRxSchedule('Schedule H'), isTrue);
    expect(isRxSchedule('Schedule H1'), isTrue);
    expect(isRxSchedule('OTC'), isFalse);
    expect(isNeverOnline('NDPS'), isTrue);
    expect(isNotableSchedule('Schedule G'), isTrue);
    expect(isNotableSchedule('OTC'), isFalse);
  });
}
