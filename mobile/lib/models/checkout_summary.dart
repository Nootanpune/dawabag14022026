import 'json_utils.dart';
import 'policy.dart';

/// POST /orders/preview — what the buyer must see before paying (C-35):
/// seller of record and licence per shipment, delivery estimate, country of
/// origin, charge break-up, returns note and applicable policies. Built by
/// the server from a rolled-back order; held in memory for this checkout only.
class CheckoutSummary {
  final List<PreviewShipment> shipments;
  final PreviewCharges charges;
  final String? paymentTerms;
  final String? returnsNote;
  final List<PolicyRef> policies;

  const CheckoutSummary({
    this.shipments = const [],
    this.charges = const PreviewCharges(),
    this.paymentTerms,
    this.returnsNote,
    this.policies = const [],
  });

  factory CheckoutSummary.fromJson(Map<String, dynamic> json) => CheckoutSummary(
        shipments: asMapList(json['shipments']).map(PreviewShipment.fromJson).toList(),
        charges: PreviewCharges.fromJson(asMap(json['charges'])),
        paymentTerms: asString(json['payment_terms']),
        returnsNote: asString(json['returns_note']),
        policies: PolicyRef.listFrom(json['policies']),
      );
}

class PreviewShipment {
  final String sellerType;
  final String? sellerName;
  final String? sellerLicence;
  final String? shipsFrom;
  final String? deliveryEstimate;
  final bool coldChain;
  final int subtotalPaise;
  final int gstPaise;
  final int totalPaise;
  final List<PreviewLine> lines;

  const PreviewShipment({
    required this.sellerType,
    this.sellerName,
    this.sellerLicence,
    this.shipsFrom,
    this.deliveryEstimate,
    this.coldChain = false,
    this.subtotalPaise = 0,
    this.gstPaise = 0,
    this.totalPaise = 0,
    this.lines = const [],
  });

  bool get isDawabag => sellerType == 'dawabag';

  factory PreviewShipment.fromJson(Map<String, dynamic> json) => PreviewShipment(
        sellerType: asString(json['seller_type']) ?? '',
        sellerName: asString(json['seller_name']),
        sellerLicence: asString(json['seller_licence']),
        shipsFrom: asString(json['ships_from']),
        deliveryEstimate: asString(json['delivery_estimate']),
        coldChain: asBool(json['cold_chain']),
        subtotalPaise: asInt(json['subtotal_paise']),
        gstPaise: asInt(json['gst_paise']),
        totalPaise: asInt(json['total_paise']),
        lines: asMapList(json['lines']).map(PreviewLine.fromJson).toList(),
      );
}

class PreviewLine {
  final String productId;
  final String productName;
  final int quantity;
  final int unitPricePaise;
  final int mrpPaise;
  final String? gstRate;
  final int lineTotalPaise;
  final String? drugSchedule;
  final String? netQuantity;
  final String? manufacturer;
  final String? countryOfOrigin;

  /// 'YYYY-MM' of the batch expiry, when the server allocated a batch.
  final String? batchExpiry;

  const PreviewLine({
    required this.productId,
    required this.productName,
    this.quantity = 0,
    this.unitPricePaise = 0,
    this.mrpPaise = 0,
    this.gstRate,
    this.lineTotalPaise = 0,
    this.drugSchedule,
    this.netQuantity,
    this.manufacturer,
    this.countryOfOrigin,
    this.batchExpiry,
  });

  factory PreviewLine.fromJson(Map<String, dynamic> json) => PreviewLine(
        productId: asString(json['product_id']) ?? '',
        productName: asString(json['product_name']) ?? '',
        quantity: asInt(json['quantity']),
        unitPricePaise: asInt(json['unit_price_paise']),
        mrpPaise: asInt(json['mrp_paise']),
        gstRate: asString(json['gst_rate']),
        lineTotalPaise: asInt(json['line_total_paise']),
        drugSchedule: asString(json['drug_schedule']),
        netQuantity: asString(json['net_quantity']),
        manufacturer: asString(json['manufacturer']),
        countryOfOrigin: asString(json['country_of_origin']),
        batchExpiry: asString(json['batch_expiry']),
      );
}

class PreviewCharges {
  final int itemsPaise;
  final int gstPaise;
  final int deliveryPaise;
  final int discountPaise;
  final int walletPaise;
  final int totalPayablePaise;

  const PreviewCharges({
    this.itemsPaise = 0,
    this.gstPaise = 0,
    this.deliveryPaise = 0,
    this.discountPaise = 0,
    this.walletPaise = 0,
    this.totalPayablePaise = 0,
  });

  factory PreviewCharges.fromJson(Map<String, dynamic> json) => PreviewCharges(
        itemsPaise: asInt(json['items_paise']),
        gstPaise: asInt(json['gst_paise']),
        deliveryPaise: asInt(json['delivery_paise']),
        discountPaise: asInt(json['discount_paise']),
        walletPaise: asInt(json['wallet_paise']),
        totalPayablePaise: asInt(json['total_payable_paise']),
      );
}
