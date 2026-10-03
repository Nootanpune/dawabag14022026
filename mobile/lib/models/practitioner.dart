import 'json_utils.dart';

// Sales to doctors and medical institutions (Sprint 44; Drugs Rules 1945
// r.64(2), r.65(9)(b); FDA Maharashtra (Pune Division) circular No.
// Drug/Wholesalers Memo./16/2026/1 dated 30-09-2026; Rulebook C-15, C-46).
// Every status, link and message is the server's; nothing is kept on the device.

/// The buyer type that buys as a doctor / medical institution.
const kPractitionerType = 'doc_hospital';

/// `practitioner_kind` values the server accepts at sign-up (auth.controller).
const kPractitionerKinds = {
  'doctor': 'A doctor (my own registration)',
  'institution': 'A hospital, clinic or nursing home',
};

/// Website wording (REGISTRATION_STATUS_LABELS).
const Map<String, String> kRegistrationStatusLabels = {
  'pending': 'Waiting for our check',
  'verified': 'Verified',
  'rejected': 'Not verified',
  'suspended': 'Suspended',
};

/// GET /practitioner-sales/me — the medical council registration as Dawabag
/// staff verified it; `applies` false for every other buyer.
class PractitionerRegistration {
  final bool applies;
  /// 'doctor' | 'institution'
  final String kind;
  final String? registrationNumber;
  final String? council;
  final String? nameAsPerRegister;
  final String status;
  final String? validTill;
  final bool certificateUploaded;
  final bool canOrder;
  /// The server's plain reason (why orders are paused, or "Registration verified, …")
  final String? message;
  final String? institutionName;

  const PractitionerRegistration({
    this.applies = false,
    this.kind = 'doctor',
    this.registrationNumber,
    this.council,
    this.nameAsPerRegister,
    this.status = 'pending',
    this.validTill,
    this.certificateUploaded = false,
    this.canOrder = false,
    this.message,
    this.institutionName,
  });

  factory PractitionerRegistration.fromJson(Map<String, dynamic> j) => PractitionerRegistration(
        applies: asBool(j['applies']),
        kind: asString(j['kind']) ?? 'doctor',
        registrationNumber: asString(j['registration_number']),
        council: asString(j['council']),
        nameAsPerRegister: asString(j['name_as_per_register']),
        status: asString(j['status']) ?? 'pending',
        validTill: asString(j['valid_till']),
        certificateUploaded: asBool(j['certificate_uploaded']),
        canOrder: asBool(j['can_order']),
        message: asString(j['message']),
        institutionName: asString(asMap(j['institution'])['name']),
      );

  bool get isInstitution => kind == 'institution';

  String get statusLabel => kRegistrationStatusLabels[status] ?? status;

  /// "Medical council registration: Verified, valid till 2027-03-31"
  String get headline => 'Medical council registration: $statusLabel${validTill != null ? ', valid till $validTill' : ''}';

  /// "Registration: MMC-123 · Maharashtra Medical Council · certificate uploaded"
  String get detail => '${isInstitution ? 'Responsible doctor' : 'Registration'}: ${registrationNumber ?? '—'} · ${council ?? '—'}'
      ' · ${certificateUploaded ? 'certificate uploaded' : 'certificate not uploaded'}';
}

class WrittenOrderItem {
  final String productId;
  final String productName;
  final int quantity;
  const WrittenOrderItem({required this.productId, required this.productName, required this.quantity});

  factory WrittenOrderItem.fromJson(Map<String, dynamic> j) => WrittenOrderItem(
        productId: asString(j['product_id']) ?? '',
        productName: asString(j['product_name']) ?? '',
        quantity: asInt(j['quantity']),
      );
}

/// A signed written order (GET /written-orders/mine, order detail `written_orders[]`).
class WrittenOrder {
  final String id;
  /// 'upload' (signed requisition uploaded) | 'in_app' (signed in the app)
  final String kind;
  final String? signedAt;
  final List<WrittenOrderItem> items;
  final String? documentName;
  /// Set when it was made for a change to the order
  final String? orderEditId;

  const WrittenOrder({required this.id, required this.kind, this.signedAt, this.items = const [], this.documentName, this.orderEditId});

  factory WrittenOrder.fromJson(Map<String, dynamic> j) => WrittenOrder(
        id: asString(j['id']) ?? '',
        kind: asString(j['kind']) ?? 'upload',
        signedAt: asString(j['signed_at']),
        items: asMapList(j['items']).map(WrittenOrderItem.fromJson).toList(),
        documentName: asString(j['document_name']),
        orderEditId: asString(j['order_edit_id']),
      );

  static List<WrittenOrder> listFrom(Object? raw) =>
      asMapList(raw).map(WrittenOrder.fromJson).where((w) => w.id.isNotEmpty).toList();

  bool get uploaded => kind == 'upload';

  /// "Uploaded requisition (scan.pdf)" / "Signed in the app (2 medicines)"
  String get title => uploaded
      ? 'Uploaded requisition${documentName != null && documentName!.isNotEmpty ? ' ($documentName)' : ''}'
      : 'Signed in the app (${items.length} medicine${items.length == 1 ? '' : 's'})';
}

/// POST /written-orders/requisition/preview — the exact text the doctor signs.
class RequisitionPreview {
  final String text;
  final String nameAsPerRegister;
  final String? signature;
  const RequisitionPreview({required this.text, required this.nameAsPerRegister, this.signature});

  factory RequisitionPreview.fromJson(Map<String, dynamic> j) => RequisitionPreview(
        text: asString(j['text']) ?? '',
        nameAsPerRegister: asString(j['name_as_per_register']) ?? '',
        signature: asString(j['signature']),
      );
}

/// Written-order upload limits (backend WRITTEN_ORDER_MAX_BYTES): PDF, JPEG or PNG up to 5 MB.
const int kWrittenOrderMaxBytes = 5 * 1024 * 1024;
