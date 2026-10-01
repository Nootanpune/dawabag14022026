import 'json_utils.dart';

/// Buyer complaints from /api/v1/grievances (C-36: grievance redressal with
/// acknowledgement and resolution deadlines set by the server).

/// Categories accepted by POST /grievances, with display labels.
const Map<String, String> kGrievanceCategories = {
  'order': 'Order',
  'delivery': 'Delivery',
  'product_quality': 'Product quality',
  'refund': 'Refund',
  'prescription': 'Prescription',
  'privacy': 'Privacy / personal data',
  'pricing': 'Pricing',
  'other': 'Other',
};

String grievanceCategoryLabel(String category) =>
    kGrievanceCategories[category] ?? category.replaceAll('_', ' ');

/// Server statuses: open → acknowledged → in_progress → resolved → closed.
String grievanceStatusLabel(String status) {
  switch (status) {
    case 'open':
      return 'Open';
    case 'acknowledged':
      return 'Acknowledged';
    case 'in_progress':
      return 'In progress';
    case 'resolved':
      return 'Resolved';
    case 'closed':
      return 'Closed';
    default:
      return status.replaceAll('_', ' ');
  }
}

class GrievanceMessage {
  final String id;
  final bool fromStaff;
  final String body;
  final String? createdAt;
  final String? author;

  const GrievanceMessage({
    required this.id,
    required this.fromStaff,
    required this.body,
    this.createdAt,
    this.author,
  });

  factory GrievanceMessage.fromJson(Map<String, dynamic> json) => GrievanceMessage(
        id: asString(json['id']) ?? '',
        fromStaff: asBool(json['from_staff']),
        body: asString(json['body']) ?? '',
        createdAt: asString(json['created_at']),
        author: asString(json['author']),
      );
}

class Grievance {
  final String id;
  final String ticketNo;
  final String category;
  final String subject;
  final String status;
  final String? orderId;
  final String? orderNumber;
  final String? createdAt;
  final String? acknowledgedAt;
  final String? resolvedAt;
  final bool ackOverdue;
  final bool resolutionOverdue;
  final String? ackDueAt;
  final String? resolveDueAt;

  /// Detail-only fields (GET /grievances/:id).
  final String? description;
  final String? resolution;
  final List<GrievanceMessage> messages;

  const Grievance({
    required this.id,
    required this.ticketNo,
    required this.category,
    required this.subject,
    required this.status,
    this.orderId,
    this.orderNumber,
    this.createdAt,
    this.acknowledgedAt,
    this.resolvedAt,
    this.ackOverdue = false,
    this.resolutionOverdue = false,
    this.ackDueAt,
    this.resolveDueAt,
    this.description,
    this.resolution,
    this.messages = const [],
  });

  bool get isClosed => status == 'closed';
  bool get isResolved => status == 'resolved' || status == 'closed';

  factory Grievance.fromJson(Map<String, dynamic> json) => Grievance(
        id: asString(json['id']) ?? '',
        ticketNo: asString(json['ticket_no']) ?? '',
        category: asString(json['category']) ?? 'other',
        subject: asString(json['subject']) ?? '',
        status: asString(json['status']) ?? 'open',
        orderId: asString(json['order_id']),
        orderNumber: asString(json['order_number']),
        createdAt: asString(json['created_at']),
        acknowledgedAt: asString(json['acknowledged_at']),
        resolvedAt: asString(json['resolved_at']),
        ackOverdue: asBool(json['ack_overdue']),
        resolutionOverdue: asBool(json['resolution_overdue']),
        ackDueAt: asString(json['ack_due_at']),
        resolveDueAt: asString(json['resolve_due_at']),
        description: asString(json['description']),
        resolution: asString(json['resolution']),
        messages: asMapList(json['messages']).map(GrievanceMessage.fromJson).toList(),
      );

  static List<Grievance> listFrom(Map<String, dynamic> data) =>
      asMapList(data['grievances']).map(Grievance.fromJson).toList();
}
