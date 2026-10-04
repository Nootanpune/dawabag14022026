// Sprint 47 — who may buy a product (owner decision 2026-10-04; backend
// services/buyerRestriction). The SERVER decides on every path (search, product
// page, cart, checkout, order changes, refills) and sends, with each product,
// who may buy it (`buyer_restriction`: everyone | practitioners_only |
// trade_only), the label buyers see (`buyer_restriction_label`, null for
// everyone) and whether THIS buyer may add it (`buyer_may_buy`). The app only
// shows that: a restricted product is listed for everyone with its label, and a
// buyer who may not buy it gets no Add button. Nothing is stored on the device.
// An older server without these fields: nothing changes (allowed, no label).

/// The label buyers see ("Supplied only to doctors and hospitals"), or null.
String? buyerRestrictionLabel(Map<String, dynamic> product) {
  final label = product['buyer_restriction_label'];
  return label is String && label.trim().isNotEmpty ? label.trim() : null;
}

/// True only when the server says this buyer (or guest) may not buy it.
/// A missing field (older server) means allowed, as before.
bool buyerMayNotBuy(Map<String, dynamic> product) => product['buyer_may_buy'] == false;

/// Who may buy it, in a sentence (product page, as the website's note).
String? buyerRestrictionExplanation(String? restriction) {
  switch (restriction) {
    case 'practitioners_only':
      return 'Dawabag supplies this only to doctors and hospitals whose medical registration we have verified, '
          'against a signed written order.';
    case 'trade_only':
      return 'Dawabag supplies this only to retailers and wholesalers with a valid drug licence checked by us, '
          'and to verified doctors and hospitals.';
    default:
      return null;
  }
}

/// Shown on the product page to a buyer who may not buy it.
const String kBuyerRestrictedCannotAdd = 'Your account cannot add it to the cart.';
