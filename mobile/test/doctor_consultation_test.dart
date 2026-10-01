import 'package:flutter_test/flutter_test.dart';
import 'package:dawabag/models/doctor_consultation.dart';

void main() {
  group('DoctorConsultation (C-22, C-23)', () {
    test('reads a row of GET /consultations/doctor', () {
      final c = DoctorConsultation.fromJson({
        'id': 'c1', 'mode': 'video', 'status': 'in_progress', 'payment_status': 'paid',
        'slot_date': '2026-10-01', 'slot_start': '10:00:00', 'patient_name': 'Asha',
        'patient_gender': 'female', 'patient_age': 34,
      });
      expect(c.canTryJoin, isTrue);
      expect(c.canEnd, isTrue);
      expect(c.patientDetails, 'Female, 34');
    });

    test('only a consultation in progress can be ended', () {
      final booked = DoctorConsultation.fromJson({'id': 'c2', 'status': 'booked'});
      final done = DoctorConsultation.fromJson({'id': 'c3', 'status': 'completed'});
      expect(booked.canEnd, isFalse);
      expect(booked.canTryJoin, isTrue);
      expect(done.canTryJoin, isFalse);
    });
  });
}
