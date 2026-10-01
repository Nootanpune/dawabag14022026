import '../models/consultation.dart';
import '../models/eprescription.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Teleconsultations and their e-prescriptions (C-22..C-24). Every call goes
/// to the server; callers reload after each action. The e-prescription PDF is
/// offered on the website only (the app writes no files).
extension ConsultationApi on ApiService {
  /// POST /consultations/book { doctor_id, slot_id, patient_id?, mode,
  /// chief_complaint (3–1000), consent: true } → 201 booking
  Future<ConsultBooking> bookConsultation({
    required String doctorId,
    required String slotId,
    String? patientId,
    required String mode,
    required String chiefComplaint,
    required bool consent,
  }) async {
    final res = await dio.post('/consultations/book', data: {
      'doctor_id': doctorId,
      'slot_id': slotId,
      if (patientId != null && patientId.isNotEmpty) 'patient_id': patientId,
      'mode': mode,
      'chief_complaint': chiefComplaint,
      'consent': consent,
    });
    return ConsultBooking.fromJson(apiData(res));
  }

  /// GET /consultations/my
  Future<List<Consultation>> getMyConsultations() async {
    final res = await dio.get('/consultations/my');
    return apiDataList(res).map(Consultation.fromJson).toList();
  }

  /// POST /consultations/:id/pay → { gateway_order_id, amount_paise, key_id }
  Future<ConsultPaymentOrder> startConsultationPayment(String id) async {
    final res = await dio.post('/consultations/$id/pay');
    return ConsultPaymentOrder.fromJson(apiData(res));
  }

  /// POST /consultations/:id/pay/verify (the server checks the signature)
  Future<void> verifyConsultationPayment(
    String id, {
    required String? razorpayOrderId,
    required String? razorpayPaymentId,
    required String? razorpaySignature,
  }) async {
    await dio.post('/consultations/$id/pay/verify', data: {
      'razorpay_order_id': razorpayOrderId,
      'razorpay_payment_id': razorpayPaymentId,
      'razorpay_signature': razorpaySignature,
    });
  }

  /// GET /consultations/:id/join → { channel, mode, app_id, role, uid, token,
  /// token_expires_in } (token fields Sprint 13, C-23).
  /// 402 when unpaid; 409 when more than 15 minutes early or not open.
  Future<ConsultJoin> joinConsultation(String id) async {
    final res = await dio.get('/consultations/$id/join');
    return ConsultJoin.fromJson(apiData(res));
  }

  /// POST /consultations/:id/cancel { reason (3–500) } → { id, status,
  /// refund: { id, amount_paise } | { pending: true, amount_paise } | null }
  Future<Map<String, dynamic>> cancelConsultation(String id, String reason) async {
    final res = await dio.post('/consultations/$id/cancel', data: {'reason': reason});
    return apiData(res);
  }

  /// GET /consultations/prescriptions/:id
  Future<EPrescription> getEPrescription(String id) async {
    final res = await dio.get('/consultations/prescriptions/$id');
    return EPrescription.fromJson(apiData(res));
  }

  /// POST /consultations/prescriptions/:id/use { order_id? } →
  /// { prescription_id, status, order_id }
  Future<Map<String, dynamic>> useEPrescriptionAtDawabag(String id, {String? orderId}) async {
    final res = await dio.post('/consultations/prescriptions/$id/use', data: {
      if (orderId != null && orderId.isNotEmpty) 'order_id': orderId,
    });
    return apiData(res);
  }
}
