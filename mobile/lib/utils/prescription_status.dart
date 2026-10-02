import 'ist.dart';

/// Plain-English status of one of the buyer's prescriptions (statuses from
/// the server: pending / verified / rejected / expired). A pharmacist checks
/// every prescription with the order before anything is dispensed (C-08).
enum RxTone { waiting, ok, bad, muted }

class RxStatus {
  final String label;
  final String hint;
  final RxTone tone;
  const RxStatus(this.label, this.hint, this.tone);
}

RxStatus prescriptionStatus(Map<String, dynamic> rx) {
  switch (rx['status']) {
    case 'verified':
      return const RxStatus('Checked by our pharmacist', 'You can choose it again at checkout while it is valid.', RxTone.ok);
    case 'rejected':
      final reason = rx['rejection_reason']?.toString();
      return RxStatus('Not accepted',
          reason == null || reason.isEmpty ? 'Please upload a clear, complete and current prescription.' : reason, RxTone.bad);
    case 'expired':
      return const RxStatus('Expired', 'Please upload a new prescription from your doctor.', RxTone.muted);
    default:
      final order = rx['order_number']?.toString();
      return rx['order_id'] != null
          ? RxStatus('Waiting for our pharmacist',
              'Our pharmacist checks it with ${order == null ? 'your order' : 'order $order'} before dispatch.', RxTone.waiting)
          : const RxStatus('Uploaded — not checked yet',
              'Choose it at checkout. Our pharmacist checks it with your order before dispatch.', RxTone.waiting);
  }
}

/// Uploaded on its own and not yet checked: it can be chosen at checkout,
/// where it joins the order for the pharmacist (C-08).
bool isAttachablePrescription(Map<String, dynamic> rx) => rx['status'] == 'pending' && rx['order_id'] == null;

/// Verified and valid today or later (India date), as on the server.
bool isReusablePrescription(Map<String, dynamic> rx) =>
    rx['status'] == 'verified' && isOnOrAfterTodayIst(rx['valid_until']);

/// Prescriptions the buyer can choose at checkout.
bool isUsableAtCheckout(Map<String, dynamic> rx) => isReusablePrescription(rx) || isAttachablePrescription(rx);
