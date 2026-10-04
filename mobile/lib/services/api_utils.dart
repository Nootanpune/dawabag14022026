import 'package:dio/dio.dart';

import 'upload_file.dart' show UploadRefused;

/// The `data` object of a `{ success, message, data }` API envelope.
Map<String, dynamic> apiData(Response<dynamic> res) {
  final body = res.data;
  if (body is Map && body['data'] is Map) {
    return Map<String, dynamic>.from(body['data'] as Map);
  }
  return <String, dynamic>{};
}

/// The `data` array of a `{ success, data: [...] }` API envelope (list
/// endpoints such as GET /doctors and GET /consultations/my).
List<Map<String, dynamic>> apiDataList(Response<dynamic> res) {
  final body = res.data;
  if (body is Map && body['data'] is List) {
    return (body['data'] as List)
        .whereType<Map>()
        .map((m) => Map<String, dynamic>.from(m))
        .toList();
  }
  return const [];
}

/// MIME type for an upload, from the file extension (PDF / JPG / PNG).
String? mimeTypeForFilename(String filename) {
  final dot = filename.lastIndexOf('.');
  if (dot < 0) return null;
  switch (filename.substring(dot + 1).toLowerCase()) {
    case 'pdf':
      return 'application/pdf';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    default:
      return null;
  }
}

/// Human-readable message from an API error. Understands the
/// `{ success:false, message, error, errors:[{path, message}] }` envelope
/// (422 validation errors list every field message).
String apiErrorMessage(
  Object error, {
  String fallback = 'Something went wrong. Please try again.',
}) {
  // Refused by the app before upload (HEIC, not PDF/JPG/PNG): the reason as is
  if (error is UploadRefused) return error.message;
  if (error is DioException) {
    // A server fault's own text is technical: a plain sentence with what to do (Sprint 26)
    final status = error.response?.statusCode;
    // ...except a 500 the server meant for the person, with its own plain sentence (Sprint 43)
    final serverMessage = _plainServerFault(error);
    if (serverMessage != null) return serverMessage;
    if (status == 500 || status == 502 || status == 504) {
      return 'Something went wrong on our side. Please try again in a minute.';
    }
    final data = error.response?.data;
    if (data is Map) {
      final errors = data['errors'];
      if (errors is List && errors.isNotEmpty) {
        final msgs = errors
            .map((e) => e is Map ? e['message']?.toString() : e?.toString())
            .whereType<String>()
            .where((s) => s.isNotEmpty)
            .toList();
        if (msgs.isNotEmpty) return msgs.join('\n');
      }
      final msg = data['message'] ?? data['error'];
      if (msg is String && msg.isNotEmpty) return msg;
    }
    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'The request timed out. Check your connection and try again.';
      case DioExceptionType.connectionError:
        return 'Cannot reach the server. Check your internet connection.';
      default:
        break;
    }
  }
  return fallback;
}

/// Code the server sends (500) when sealed health details cannot be opened on
/// this server (Sprint 43, health data key missing or changed): GET / PUT
/// /health-profile. Its `message` says what to do and is shown as is.
const kHealthDataUnreadable = 'HEALTH_DATA_UNREADABLE';

/// Server faults whose `message` is written for the person, not technical.
const Set<String> _plainServerFaultCodes = {kHealthDataUnreadable};

String? _plainServerFault(DioException error) {
  final data = error.response?.data;
  if (error.response?.statusCode != 500 || data is! Map) return null;
  if (!_plainServerFaultCodes.contains(data['code']?.toString())) return null;
  final msg = data['message'] ?? data['error'];
  return msg is String && msg.trim().isNotEmpty ? msg : null;
}

/// Code the server sends (403) while a login still has the temporary password
/// an admin set (Sprint 28, backend auth.middleware): every route but
/// POST /auth/change-password and /auth/logout is refused until it is changed.
const kPasswordChangeRequired = 'PASSWORD_CHANGE_REQUIRED';

/// The machine-readable `code` of an API error envelope, if any.
String? apiErrorCode(Object error) {
  if (error is! DioException) return null;
  final data = error.response?.data;
  return data is Map ? data['code']?.toString() : null;
}

/// True when the server refused the call until the password is changed.
bool isPasswordChangeRequired(Object error) =>
    error is DioException && error.response?.statusCode == 403 && apiErrorCode(error) == kPasswordChangeRequired;

/// Code the server sends (409) while prescription-medicine sales are paused
/// (Sprint 38 emergency stop, C-08): adding or raising such a line in the cart,
/// POST /orders, /payments/create-order and /payments/demo. The envelope's
/// `message` is ready for the buyer and is shown as is.
const kRxSalesPaused = 'RX_SALES_PAUSED';

/// True when the server refused the call because prescription sales are paused.
bool isRxSalesPaused(Object error) =>
    error is DioException && error.response?.statusCode == 409 && apiErrorCode(error) == kRxSalesPaused;

/// Code the server sends (422) when an order with prescription medicines has no
/// prescription with it (Sprint 39, C-08): POST /orders without `prescription_id`,
/// and /payments/create-order or /payments/demo for an order still without one.
/// The envelope's `message` is ready for the buyer and is shown as is.
const kPrescriptionRequired = 'PRESCRIPTION_REQUIRED';

/// True when the server refused the call until a prescription goes with the order.
bool isPrescriptionRequired(Object error) =>
    error is DioException && error.response?.statusCode == 422 && apiErrorCode(error) == kPrescriptionRequired;

/// Code the server sends (403) for a product a pharmacist has not allowed for
/// online sale (Sprint 39, C-10): adding it to the cart, or ordering it.
const kNotForOnlineSale = 'NOT_FOR_ONLINE_SALE';

/// True when the server refused a product that is not sold online.
bool isNotForOnlineSale(Object error) =>
    error is DioException && error.response?.statusCode == 403 && apiErrorCode(error) == kNotForOnlineSale;

/// The HTTP status of an API error, if any.
int? apiErrorStatus(Object error) => error is DioException ? error.response?.statusCode : null;

// ── Sprint 44: order changes and sales to doctors / institutions ─────────────
// Every one of these refusals carries a `message` ready for the buyer.

/// 409: the order can no longer be changed (invoice issued / pharmacist approved).
const kOrderNotEditable = 'ORDER_NOT_EDITABLE';

/// 403: the doctor's / institution's registration is not verified or has lapsed (r.65(9)(b)).
const kPractitionerRegistrationInvalid = 'PRACTITIONER_REGISTRATION_INVALID';

/// 422: a doctor / institution order (or addition) needs a signed written order.
const kWrittenOrderRequired = 'WRITTEN_ORDER_REQUIRED';

/// 409: the written order was already used for another order.
const kWrittenOrderUsed = 'WRITTEN_ORDER_USED';

/// 400 / 429: signing in the app was refused (wrong password or name / too many tries).
const kWrittenOrderSignatureInvalid = 'WRITTEN_ORDER_SIGNATURE_INVALID';
const kWrittenOrderSignPaused = 'WRITTEN_ORDER_SIGN_PAUSED';

/// 404: the tax invoice is issued only when our pharmacist approves that part of the order.
const kInvoiceNotIssued = 'INVOICE_NOT_ISSUED';

/// True for a refusal about the chosen written order (required, not covering,
/// too old, already used): the buyer signs or uploads another one.
bool isWrittenOrderProblem(Object error) => (apiErrorCode(error) ?? '').startsWith('WRITTEN_ORDER_');

/// True when the server refused because the registration does not allow sales now.
bool isPractitionerRegistrationInvalid(Object error) => apiErrorCode(error) == kPractitionerRegistrationInvalid;

/// Code the server sends (403) for a product this buyer may not buy (Sprint 47:
/// doctors and hospitals only / licensed trade buyers only): PUT
/// /cart/items/:id, POST /orders, /orders/preview and /orders/:id/edit. The
/// envelope's `message` is a plain sentence for the buyer and is shown as is.
const kBuyerRestricted = 'BUYER_RESTRICTED';

/// True when the server refused a product this buyer may not buy.
bool isBuyerRestricted(Object error) =>
    error is DioException && error.response?.statusCode == 403 && apiErrorCode(error) == kBuyerRestricted;
