import '../../models/cart_view.dart';
import '../../models/json_utils.dart';
import '../../services/api_utils.dart';
import '../../services/checkout_api.dart';
import '../../utils/formatters.dart';
import '../../utils/payment_hold.dart';
import '../orders/widgets/order_shipments_card.dart';

/// Checkout order (the same as the web): address → prescription (Rx orders
/// only, chosen BEFORE the order exists) → review (C-35 summary) → place order
/// (POST /orders WITH `prescription_id` — Sprint 39, the server refuses a
/// prescription order without one, C-08) → payment (held until the
/// pharmacist's check for a prescription order, C-37) → confirmed.
/// [rxFix]: the order is placed but payment was refused because no
/// prescription is with it; the buyer chooses or uploads one for it.
enum CheckoutStep { address, prescription, review, rxFix, payment, confirmed }

/// Step-bar labels; the prescription step appears only for Rx orders.
List<String> checkoutBarLabels(bool hasRx) => hasRx
    ? const ['Address', 'Prescription', 'Review', 'Payment']
    : const ['Address', 'Review', 'Payment'];

/// Where the bottom button leads (before the order exists, review places it).
CheckoutStep checkoutNextStep(CheckoutStep step, {required bool hasRx}) => switch (step) {
      CheckoutStep.address => hasRx ? CheckoutStep.prescription : CheckoutStep.review,
      CheckoutStep.prescription => CheckoutStep.review,
      CheckoutStep.review => CheckoutStep.payment,
      CheckoutStep.rxFix => CheckoutStep.payment,
      CheckoutStep.payment => CheckoutStep.confirmed,
      CheckoutStep.confirmed => CheckoutStep.confirmed,
    };

/// Where Back leads inside checkout, or null to leave the checkout screen.
/// Once the order is placed, address and prescription can no longer change.
CheckoutStep? checkoutPreviousStep(CheckoutStep step, {required bool hasRx, required bool orderPlaced}) => switch (step) {
      CheckoutStep.address => null,
      CheckoutStep.prescription => CheckoutStep.address,
      CheckoutStep.review => orderPlaced ? null : (hasRx ? CheckoutStep.prescription : CheckoutStep.address),
      CheckoutStep.rxFix => null,
      CheckoutStep.payment => CheckoutStep.review,
      CheckoutStep.confirmed => null,
    };

extension CheckoutStepX on CheckoutStep {
  /// Position in the step bar (-1 once confirmed; the bar is then hidden).
  int barIndex(bool hasRx) => switch (this) {
        CheckoutStep.address => 0,
        CheckoutStep.prescription || CheckoutStep.rxFix => 1,
        CheckoutStep.review => hasRx ? 2 : 1,
        CheckoutStep.payment => hasRx ? 3 : 2,
        CheckoutStep.confirmed => -1,
      };

  /// Bottom-button label; amounts are the server's figures.
  String buttonLabel({
    required int totalPaise,
    required bool orderPlaced,
    bool hasRx = false,
    bool rxChosen = false,
    bool chargeAfterCheck = false,
  }) =>
      switch (this) {
        CheckoutStep.address => hasRx ? 'Continue to prescription' : 'Review order',
        CheckoutStep.prescription => rxChosen ? 'Continue to review' : 'Choose or upload a prescription',
        CheckoutStep.review => orderPlaced ? 'Continue to payment' : 'Place order and pay',
        CheckoutStep.rxFix => rxChosen ? 'Continue to payment' : 'Choose or upload a prescription',
        CheckoutStep.payment => payButtonLabel(totalPaise, chargeAfterCheck: chargeAfterCheck),
        CheckoutStep.confirmed => '',
      };
}

/// "Pay ₹…" — or "Authorise ₹…" when the amount is only held until the
/// pharmacist's check (Sprint 39, as the web).
String payButtonLabel(int totalPaise, {bool chargeAfterCheck = false}) =>
    '${chargeAfterCheck ? 'Authorise' : 'Pay'} ${formatPrice(totalPaise)} securely';

/// What happened when the prescription was sent with a placed order.
class PlaceOutcome {
  final PlacedOrder order;
  final CheckoutStep next; // payment, or rxFix when the prescription did not go with it
  final String? rxError;
  const PlaceOutcome(this.order, this.next, [this.rxError]);
}

/// Sprint 39: POST /orders refused the order because of its prescription — none
/// sent (422 PRESCRIPTION_REQUIRED), or the chosen one cannot be used (expired,
/// does not cover a medicine, already with another order, not found). Nothing
/// was placed; the buyer chooses or uploads another one and places it again.
bool isPrescriptionProblem(Object error) {
  if (isPrescriptionRequired(error)) return true;
  final status = apiErrorStatus(error);
  if (status != 400 && status != 404 && status != 409) return false;
  return apiErrorMessage(error, fallback: '').toLowerCase().contains('prescription');
}

/// The words shown on the prescription step after such a refusal.
String prescriptionProblemText(Object error, {required String fallback}) {
  final message = apiErrorMessage(error, fallback: fallback);
  // The 422 already says "Upload it or choose a saved one"
  return isPrescriptionRequired(error) ? message : '$message Please choose or upload another one.';
}

/// Sends the chosen prescription with an order already placed
/// (POST /prescriptions/:id/use-for-order) — only needed when payment for a
/// placed order was refused with PRESCRIPTION_REQUIRED ([CheckoutStep.rxFix]).
Future<PlaceOutcome> attachRxToPlacedOrder(
  PlacedOrder order, {
  required Future<void> Function(String orderId) attach,
  required bool rxChosen,
  required String Function(Object error) errorText,
}) async {
  final number = order.orderNumber ?? '';
  if (!rxChosen || order.id == null) {
    return PlaceOutcome(order, CheckoutStep.rxFix, 'Please choose or upload a prescription for order $number.');
  }
  try {
    await attach(order.id!);
    return PlaceOutcome(order, CheckoutStep.payment);
  } catch (e) {
    return PlaceOutcome(order, CheckoutStep.rxFix,
        '${errorText(e)} Please choose or upload another one for order $number.');
  }
}

/// The order as returned by POST /orders. Held in memory for the rest of
/// the checkout only; the server's order is the record.
class PlacedOrder {
  final String? id;
  final String? orderNumber;
  final int totalPaise;
  final bool requiresPrescription;
  final List<Map<String, dynamic>> shipments;
  /// Sprint 39: 'now' | 'after_pharmacist_check' (held until the check, C-37)
  final String capture;

  const PlacedOrder({
    this.id,
    this.orderNumber,
    this.totalPaise = 0,
    this.requiresPrescription = false,
    this.shipments = const [],
    this.capture = kCaptureNow,
  });

  /// The payment is only authorised now and charged after the pharmacist's check.
  bool get chargeAfterCheck => capturesAfterCheck(capture);

  factory PlacedOrder.fromJson(Map<String, dynamic> data) {
    return PlacedOrder(
      id: data['id']?.toString(),
      orderNumber: data['order_number']?.toString(),
      totalPaise: asInt(data['total_paise']),
      requiresPrescription: data['requires_prescription'] == true,
      shipments: OrderShipmentsCard.fromOrder(data),
      capture: asString(data['capture']) ?? kCaptureNow,
    );
  }
}

/// Body for POST /orders/preview and POST /orders from the server cart and
/// the chosen address (its pincode decides serviceability and sellers).
/// [prescriptionId]: the prescription chosen for a prescription order (C-08).
Map<String, dynamic> checkoutOrderBody(
  CartView cart,
  Map<String, dynamic> address, {
  bool? practitionerDeclaration,
  String? prescriptionId,
}) {
  final coupon = cart.coupon;
  return CheckoutApi.orderBody(
    addressId: address['id'],
    items: cart.orderableItems
        .map((l) => <String, dynamic>{'product_id': l.productId, 'quantity': l.quantity})
        .toList(),
    couponCode: coupon != null && coupon.valid ? coupon.code : null,
    pincode: address['pincode']?.toString() ?? '',
    practitionerDeclaration: practitionerDeclaration,
    prescriptionId: prescriptionId,
  );
}
