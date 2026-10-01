import 'json_utils.dart';

/// Teleconsultations from /api/v1/consultations (Telemedicine Practice
/// Guidelines 2020; C-22, C-23). Rebuilt from every server response.

/// Modes accepted by POST /consultations/book, with display labels.
const Map<String, String> kConsultModes = {
  'video': 'Video',
  'audio': 'Audio call',
  'text': 'Chat (text)',
};

String consultModeLabel(String mode) => kConsultModes[mode] ?? mode;

/// first / follow_up (decided by the server from earlier consultations).
String consultKindLabel(String? kind) {
  switch (kind) {
    case 'first':
      return 'First consultation';
    case 'follow_up':
      return 'Follow-up';
    default:
      return (kind ?? '').replaceAll('_', ' ');
  }
}

/// Server statuses: booked → in_progress → completed; or cancelled.
String consultStatusLabel(String status) {
  switch (status) {
    case 'booked':
      return 'Booked';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status.replaceAll('_', ' ');
  }
}

/// Payment statuses: unpaid, paid, waived (free), refund_pending (cancelled
/// after payment, gateway refund not yet confirmed), refunded.
String consultPaymentLabel(String status) {
  switch (status) {
    case 'unpaid':
      return 'Fee not paid';
    case 'paid':
      return 'Paid';
    case 'waived':
      return 'No fee';
    case 'refund_pending':
      return 'Refund in progress';
    case 'refunded':
      return 'Refunded';
    default:
      return status.replaceAll('_', ' ');
  }
}

/// One row of GET /consultations/my.
class Consultation {
  final String id;
  final String mode;
  final String status;
  final String? consultKind;
  final int feePaise;
  final String paymentStatus;
  final String? chiefComplaint;
  final String? doctorName;
  final String? qualification;
  final String? council;
  final String? regNumber;
  final String? speciality;
  final String? slotDate;
  final String? slotStart;
  final String? prescriptionId;

  const Consultation({
    required this.id,
    required this.mode,
    required this.status,
    this.consultKind,
    required this.feePaise,
    required this.paymentStatus,
    this.chiefComplaint,
    this.doctorName,
    this.qualification,
    this.council,
    this.regNumber,
    this.speciality,
    this.slotDate,
    this.slotStart,
    this.prescriptionId,
  });

  bool get isOpen => status == 'booked' || status == 'in_progress';
  bool get needsPayment => status == 'booked' && paymentStatus == 'unpaid';
  bool get canJoin => isOpen && (paymentStatus == 'paid' || paymentStatus == 'waived');

  /// The server allows patients to cancel only while booked and at least two
  /// hours before the slot; it rejects anything later with its own message.
  bool get canCancel => status == 'booked';

  factory Consultation.fromJson(Map<String, dynamic> json) => Consultation(
        id: asString(json['id']) ?? '',
        mode: asString(json['mode']) ?? 'video',
        status: asString(json['status']) ?? 'booked',
        consultKind: asString(json['consult_kind']),
        feePaise: asInt(json['fee_paise']),
        paymentStatus: asString(json['payment_status']) ?? 'unpaid',
        chiefComplaint: asString(json['chief_complaint']),
        doctorName: asString(json['doctor_name']),
        qualification: asString(json['qualification']),
        council: asString(json['council']),
        regNumber: asString(json['nmc_reg_number']),
        speciality: asString(json['speciality']),
        slotDate: asString(json['slot_date']),
        slotStart: asString(json['slot_start']),
        prescriptionId: asString(json['prescription_id']),
      );
}

/// 201 response of POST /consultations/book.
class ConsultBooking {
  final String id;
  final String mode;
  final String? consultKind;
  final int feePaise;
  final String paymentStatus;

  const ConsultBooking({
    required this.id,
    required this.mode,
    this.consultKind,
    required this.feePaise,
    required this.paymentStatus,
  });

  bool get needsPayment => paymentStatus == 'unpaid';

  factory ConsultBooking.fromJson(Map<String, dynamic> json) => ConsultBooking(
        id: asString(json['id']) ?? '',
        mode: asString(json['mode']) ?? 'video',
        consultKind: asString(json['consult_kind']),
        feePaise: asInt(json['fee_paise']),
        paymentStatus: asString(json['payment_status']) ?? 'unpaid',
      );
}

/// POST /consultations/:id/pay → the Razorpay order the app opens.
class ConsultPaymentOrder {
  final String gatewayOrderId;
  final int amountPaise;
  final String? keyId;

  const ConsultPaymentOrder({
    required this.gatewayOrderId,
    required this.amountPaise,
    this.keyId,
  });

  factory ConsultPaymentOrder.fromJson(Map<String, dynamic> json) => ConsultPaymentOrder(
        gatewayOrderId: asString(json['gateway_order_id']) ?? '',
        amountPaise: asInt(json['amount_paise']),
        keyId: asString(json['key_id']),
      );
}

/// GET /consultations/:id/join → where the call client connects.
class ConsultJoin {
  final String channel;
  final String mode;
  final String? appId;
  final String role;

  const ConsultJoin({
    required this.channel,
    required this.mode,
    this.appId,
    required this.role,
  });

  factory ConsultJoin.fromJson(Map<String, dynamic> json) => ConsultJoin(
        channel: asString(json['channel']) ?? '',
        mode: asString(json['mode']) ?? 'video',
        appId: asString(json['app_id']),
        role: asString(json['role']) ?? 'patient',
      );
}
