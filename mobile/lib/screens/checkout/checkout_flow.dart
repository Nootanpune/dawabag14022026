import '../../utils/formatters.dart';
import '../orders/widgets/order_shipments_card.dart';

enum CheckoutStep { address, prescription, payment, confirmed }

/// Step-bar labels; the prescription step appears only for Rx orders.
List<String> checkoutBarLabels(bool hasRx) =>
    hasRx ? const ['Address', 'Prescription', 'Payment'] : const ['Address', 'Payment'];

extension CheckoutStepX on CheckoutStep {
  /// Position in the step bar (-1 once confirmed; the bar is then hidden).
  int barIndex(bool hasRx) => switch (this) {
        CheckoutStep.address => 0,
        CheckoutStep.prescription => 1,
        CheckoutStep.payment => hasRx ? 2 : 1,
        CheckoutStep.confirmed => -1,
      };

  /// Bottom-button label; the amount is the server's order total.
  String buttonLabel(int totalPaise) => switch (this) {
        CheckoutStep.address => 'Continue',
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
    final total = data['total_paise'];
    return PlacedOrder(
      id: data['id']?.toString(),
      orderNumber: data['order_number']?.toString(),
      totalPaise: total is num ? total.round() : 0,
      requiresPrescription: data['requires_prescription'] == true,
      shipments: OrderShipmentsCard.fromOrder(data),
    );
  }
}
