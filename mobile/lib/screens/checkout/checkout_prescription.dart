import '../../services/api_service.dart';
import '../../services/checkout_api.dart';
import '../../services/prescription_api.dart';
import '../../utils/ist.dart';
import '../../utils/prescription_describe.dart';

/// The prescription chosen for an Rx order (Sprint 32, as the web since Sprint 26):
/// chosen BEFORE the order is placed — one the buyer uploaded earlier, or a new
/// upload (POST /prescriptions/upload without an order, then chosen) — and sent
/// WITH the order as `prescription_id` (Sprint 39: POST /orders refuses a
/// prescription order without one). [attachTo] is only for a placed order whose
/// payment was refused with PRESCRIPTION_REQUIRED (POST /prescriptions/:id/use-for-order).
/// The pharmacist checks it before dispatch (C-08). Files go only to the server's
/// object store (C-41). Held in memory only; the server's order is the record.
class CheckoutPrescription {
  /// Usable at checkout: verified and still valid, or uploaded and not yet checked
  List<Map<String, dynamic>> saved = const [];
  String? selectedId;
  bool loaded = false;

  bool get hasChoice => selected != null;

  Map<String, dynamic>? get selected {
    final id = selectedId;
    if (id == null) return null;
    for (final rx in saved) {
      if (rx['id']?.toString() == id) return rx;
    }
    return null;
  }

  /// For review and payment: "photo uploaded 02 Oct 2026, 9:56 am".
  String? get label {
    final rx = selected;
    if (rx == null) return null;
    return '${prescriptionKind(rx)} uploaded ${formatDateTimeIst(rx['created_at'])}';
  }

  /// GET /prescriptions/my (usable ones). A failure leaves the list empty; the
  /// buyer can still upload a new one.
  Future<void> loadSaved() async {
    try {
      saved = await apiService.getVerifiedPrescriptions();
    } catch (_) {
      saved = const [];
    }
    loaded = true;
    if (selected == null) selectedId = null;
  }

  void select(String id) => selectedId = id;

  /// Uploads a new prescription (no order yet), reloads the list and chooses it.
  Future<void> uploadNew({required String filePath, required String filename}) async {
    final created = await apiService.uploadPrescription(filePath: filePath, filename: filename);
    await loadSaved();
    final id = created['id']?.toString();
    if (id != null) selectedId = id;
  }

  /// Sends the chosen prescription with [orderId] (C-08). Throws on an API error
  /// (e.g. 400 "expired" / "does not cover: …") for the screen to show.
  Future<void> attachTo(String orderId) async {
    final id = selectedId;
    if (id == null) return;
    await apiService.useSavedPrescriptionForOrder(prescriptionId: id, orderId: orderId);
  }
}
