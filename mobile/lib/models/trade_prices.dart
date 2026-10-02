import '../utils/ist.dart';
import 'json_utils.dart';

/// Sprint 34 (Sprint 32 on the web): whether the signed-in retailer's or
/// wholesaler's trade prices are paused because a checked drug licence has
/// lapsed. The server decides it live on every request and already sends
/// retail prices; the app only reads that decision to say why (C-14).
class TradePause {
  final String form;
  /// "Form 20B"
  final String label;
  final String licenceNumber;
  /// YYYY-MM-DD
  final String expiredOn;

  const TradePause({required this.form, required this.label, required this.licenceNumber, required this.expiredOn});

  factory TradePause.fromJson(Map<String, dynamic> j) => TradePause(
        form: asString(j['form']) ?? '',
        label: asString(j['label']) ?? 'licence',
        licenceNumber: asString(j['licence_number']) ?? '',
        expiredOn: asString(j['expired_on']) ?? '',
      );
}

/// GET /users/me/trade-prices → { pricing_type, paused, licence }
class TradePrices {
  final String pricingType;
  final bool paused;
  final TradePause? licence;

  const TradePrices({required this.pricingType, required this.paused, this.licence});

  factory TradePrices.fromJson(Map<String, dynamic> j) {
    final l = j['licence'];
    return TradePrices(
      pricingType: asString(j['pricing_type']) ?? 'customer',
      paused: asBool(j['paused']),
      licence: l is Map ? TradePause.fromJson(asMap(l)) : null,
    );
  }

  /// The banner shows only when the server says paused AND names the licence.
  bool get showBanner => paused && licence != null;
}

/// Trade accounts whose prices depend on a drug licence (the web's check).
bool isTradeBuyer(String? customerType) => customerType == 'b2b_retailer' || customerType == 'b2b_wholesaler';

/// "Your drug licence Form 20 MH-1 expired on 01 Oct 2026 — trade prices are
/// paused until a renewal is checked" (same words as the web's tradePauseText).
String tradePauseText(TradePause l) =>
    'Your drug licence ${l.label} ${l.licenceNumber} expired on ${formatDateIst(l.expiredOn)} — '
    'trade prices are paused until a renewal is checked';
