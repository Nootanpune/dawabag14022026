import '../models/json_utils.dart';
import '../models/practitioner.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// Sales to doctors and medical institutions (Sprint 44; Drugs Rules 1945
/// r.65(9)(b); FDA Maharashtra circular Drug/Wholesalers Memo./16/2026/1).
/// Files go only to the server's object store; the password typed to sign is
/// sent once and never kept; links are short-lived and opened outside the app.
extension PractitionerApi on ApiService {
  /// GET /practitioner-sales/me → registration status, can_order and message.
  Future<PractitionerRegistration> getMyRegistration() async {
    final res = await dio.get('/practitioner-sales/me');
    return PractitionerRegistration.fromJson(apiData(res));
  }

  /// GET /written-orders/mine → the buyer's written orders signed in the last
  /// 30 days and not yet used (to reuse one).
  Future<List<WrittenOrder>> getMyWrittenOrders() async {
    final res = await dio.get('/written-orders/mine');
    return WrittenOrder.listFrom(apiData(res)['written_orders']);
  }

  /// (a) POST /written-orders/upload (multipart `file`): the doctor's signed
  /// requisition, PDF / JPEG / PNG up to 5 MB, typed by its bytes.
  Future<WrittenOrder> uploadWrittenOrder({required String filePath, required String filename}) async {
    final data = await uploadMultipart('/written-orders/upload',
        filePath: filePath, filename: filename, fileField: 'file', sendTimeout: const Duration(seconds: 60));
    return WrittenOrder.fromJson({...data, 'document_name': filename});
  }

  /// POST /written-orders/requisition/preview {items} → the text to sign.
  Future<RequisitionPreview> previewRequisition(List<Map<String, dynamic>> items) async {
    final res = await dio.post('/written-orders/requisition/preview', data: {'items': items});
    return RequisitionPreview.fromJson(apiData(res));
  }

  /// (b) POST /written-orders/requisition {items, typed_name, password,
  /// declaration:true} — signed by the registered doctor's own login. 400
  /// WRITTEN_ORDER_SIGNATURE_INVALID (wrong password or name), 429
  /// WRITTEN_ORDER_SIGN_PAUSED (too many tries). [password] is not kept.
  Future<WrittenOrder> signRequisition({
    required List<Map<String, dynamic>> items,
    required String typedName,
    required String password,
  }) async {
    final res = await dio.post('/written-orders/requisition', data: {
      'items': items,
      'typed_name': typedName,
      'password': password,
      'declaration': true,
    });
    return WrittenOrder.fromJson(apiData(res));
  }

  /// GET /written-orders/:id/link → a 5-minute link (every view is audited, C-41).
  Future<Uri> writtenOrderUri(String id) async {
    final res = await dio.get('/written-orders/${Uri.encodeComponent(id)}/link');
    final url = asString(apiData(res)['url']) ?? '';
    if (url.isEmpty) throw StateError('No document link returned');
    return Uri.parse(dio.options.baseUrl).resolve(url);
  }
}
