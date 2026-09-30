import 'package:image_picker/image_picker.dart';

import '../../services/api_service.dart';
import '../../services/checkout_api.dart';

/// The prescription chosen for an Rx order: a new photo, uploaded straight
/// to the server's object store and never kept by the app (C-41), or one of
/// the buyer's pharmacist-verified prescriptions. Held in memory only.
class CheckoutPrescription {
  XFile? file;
  String? savedId;
  List<dynamic> saved = const [];

  bool get hasChoice => file != null || savedId != null;

  /// GET /prescriptions/my (verified only). Failures leave the list empty.
  Future<void> loadSaved() async {
    try {
      saved = await apiService.getVerifiedPrescriptions();
    } catch (_) {}
  }

  void pick(XFile picked) {
    file = picked;
    savedId = null;
  }

  void selectSaved(String id) {
    savedId = id;
    file = null;
  }

  /// Uploads the new photo for [orderId]; nothing to do for a saved one.
  Future<void> upload(String orderId) async {
    final f = file;
    if (f == null) return;
    await apiService.uploadOrderPrescription(filePath: f.path, filename: f.name, orderId: orderId);
  }
}
