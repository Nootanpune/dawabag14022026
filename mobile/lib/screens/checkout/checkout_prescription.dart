import 'package:image_picker/image_picker.dart';

import '../../services/api_service.dart';
import '../../services/checkout_api.dart';

/// The prescription chosen for an Rx order: a new photo, uploaded straight
/// to the server's object store and never kept by the app (C-41), or one of
/// the buyer's pharmacist-verified, unexpired prescriptions (C-08). Held in
/// memory only; the server's order is the record.
class CheckoutPrescription {
  XFile? file;
  String? savedId;
  List<Map<String, dynamic>> saved = const [];

  bool get hasChoice => file != null || savedId != null;

  /// GET /prescriptions/my (verified and still valid only). Failures leave
  /// the list empty; the buyer can still upload a photo.
  Future<void> loadSaved() async {
    try {
      saved = await apiService.getVerifiedPrescriptions();
    } catch (_) {
      saved = const [];
    }
    final id = savedId;
    if (id != null && !saved.any((rx) => rx['id']?.toString() == id)) savedId = null;
  }

  void pick(XFile picked) {
    file = picked;
    savedId = null;
  }

  void selectSaved(String id) {
    savedId = id;
    file = null;
  }

  /// Sends the choice for [orderId]: uploads the new photo, or offers the
  /// saved prescription via POST /prescriptions/:id/use-for-order (C-08).
  /// Either way the pharmacist confirms it before dispatch. Throws on an API
  /// error (e.g. 400 "expired" / "does not cover: …") for the screen to show.
  Future<void> submit(String orderId) async {
    final f = file;
    if (f != null) {
      await apiService.uploadOrderPrescription(filePath: f.path, filename: f.name, orderId: orderId);
      return;
    }
    final id = savedId;
    if (id != null) {
      await apiService.useSavedPrescriptionForOrder(prescriptionId: id, orderId: orderId);
    }
  }
}
