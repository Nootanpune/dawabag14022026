import 'api_service.dart';
import 'api_utils.dart';

/// Signed, short-lived PDF links for tax invoices and credit notes (C-13,
/// C-33, C-37). The app never downloads or saves the file: the signed URL is
/// handed to the phone's browser / PDF viewer (server is the single source
/// of truth, no local writes).
extension InvoiceApi on ApiService {
  /// GET /invoices/shipments/:shipmentId/link → absolute signed URL.
  Future<Uri> shipmentInvoiceUri(String shipmentId) =>
      _signedUri('/invoices/shipments/$shipmentId/link');

  /// GET /invoices/credit-notes/:creditNoteId/link → absolute signed URL.
  Future<Uri> creditNoteUri(String creditNoteId) =>
      _signedUri('/invoices/credit-notes/$creditNoteId/link');

  /// The server returns { url: '/api/v1/...pdf?exp=..&sig=..', expires_in }.
  /// A root-relative path is resolved against the API origin.
  Future<Uri> _signedUri(String linkPath) async {
    final res = await dio.get(linkPath);
    final url = apiData(res)['url']?.toString() ?? '';
    if (url.isEmpty) throw StateError('No document link returned');
    return Uri.parse(dio.options.baseUrl).resolve(url);
  }
}
