import '../../models/cart_view.dart';
import '../../models/json_utils.dart';
import '../../services/checkout_api.dart';
import '../../utils/formatters.dart';
import '../orders/widgets/order_shipments_card.dart';

/// address → review (C-35 summary, POST /orders on confirm) →
/// prescription (Rx orders only) → payment → confirmed.
enum CheckoutStep { address, review, prescription, payment, confirmed }

/// Step-bar labels; the prescription step appears only for Rx orders.
List<String> checkoutBarLabels(bool hasRx) => hasRx
    ? const ['Address', 'Review', 'Prescription', 'Payment']
    : const ['Address', 'Review', 'Payment'];

extension CheckoutStepX on CheckoutStep {
  /// Position in the step bar (-1 once confirmed; the bar is then hidden).
  int barIndex(bool hasRx) => switch (this) {
        CheckoutStep.address => 0,
        CheckoutStep.review => 1,
        CheckoutStep.prescription => 2,
        CheckoutStep.payment => hasRx ? 3 : 2,
        CheckoutStep.confirmed => -1,
      };

  /// Bottom-button label; amounts are the server's figures.
  String buttonLabel({required int totalPaise, required bool orderPlaced}) => switch (this) {
        CheckoutStep.address => 'Review order',
        CheckoutStep.review => orderPlaced ? 'Continue' : 'Place order',
        CheckoutStep.prescription => 'Continue to payment',
        CheckoutStep.payment => 'Pay ${formatPrice(totalPaise)} securely',
        CheckoutStep.confirmed => '',
      };
}

/// The order as returned by POST /orders. Held in memory for the rest of
/// the checkout only; the server's order is the record.
class PlacedOrder {
  final String? id;
  final String? orderNumber;
  final int totalPaise;
  final bool requiresPrescription;
  final List<Map<String, dynamic>> shipments;

  const PlacedOrder({
    this.id,
    this.orderNumber,
    this.totalPaise = 0,
    this.requiresPrescription = false,
    this.shipments = const [],
  });

  factory PlacedOrder.fromJson(Map<String, dynamic> data) {
    return PlacedOrder(
      id: data['id']?.toString(),
      orderNumber: data['order_number']?.toString(),
      totalPaise: asInt(data['total_paise']),
      requiresPrescription: data['requires_prescription'] == true,
      shipments: OrderShipmentsCard.fromOrder(data),
    );
  }
}

/// Body for POST /orders/preview and POST /orders from the server cart and
/// the chosen address (its pincode decides serviceability and sellers).
Map<String, dynamic> checkoutOrderBody(
  CartView cart,
  Map<String, dynamic> address, {
  bool? practitionerDeclaration,
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
  );
}
