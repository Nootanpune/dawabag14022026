import 'json_utils.dart';

// Courier tracking for one shipment, from GET /orders/:id (Sprint 8):
// `tracking_status`, `rto_at` and `tracking: [{status, raw_status,
// location, event_time}]` oldest first. Plain value objects rebuilt from
// every response (server is the single source of truth); every field is
// optional so older servers and partial data parse safely.

/// Friendly labels for the normalised tracking statuses.
const Map<String, String> kTrackingStatusLabels = {
  'booked': 'Shipment booked',
  'picked_up': 'Picked up by courier',
  'in_transit': 'In transit',
  'out_for_delivery': 'Out for delivery',
  'delivered': 'Delivered',
  'exception': 'Delivery issue',
  'rto': 'Returning to Dawabag',
};

/// Label for a tracking status; falls back to the courier's own wording.
String trackingStatusLabel(String? status, [String? rawStatus]) {
  final known = status == null ? null : kTrackingStatusLabels[status];
  if (known != null) return known;
  final raw = rawStatus?.trim();
  if (raw != null && raw.isNotEmpty) return raw;
  if (status != null && status.isNotEmpty) return status.replaceAll('_', ' ');
  return 'Update';
}

DateTime? _asDateTime(Object? v) {
  final s = asString(v);
  if (s == null || s.isEmpty) return null;
  return DateTime.tryParse(s); // an instant; shown in IST via utils/ist.dart
}

String? _nonEmpty(Object? v) {
  final s = asString(v)?.trim();
  return (s == null || s.isEmpty) ? null : s;
}

class TrackingEvent {
  final String? status;
  final String? rawStatus;
  final String? location;

  /// Local time of the scan, or null when the courier sent none.
  final DateTime? eventTime;

  const TrackingEvent({this.status, this.rawStatus, this.location, this.eventTime});

  factory TrackingEvent.fromJson(Map<String, dynamic> json) => TrackingEvent(
        status: _nonEmpty(json['status']),
        rawStatus: _nonEmpty(json['raw_status']),
        location: _nonEmpty(json['location']),
        eventTime: _asDateTime(json['event_time']),
      );

  String get label => trackingStatusLabel(status, rawStatus);
}

class ShipmentTracking {
  /// booked | picked_up | in_transit | out_for_delivery | delivered |
  /// exception | rto, or null before the courier has the shipment.
  final String? trackingStatus;

  /// Set when the shipment is being returned to origin (RTO).
  final DateTime? rtoAt;

  /// Courier scans, oldest first (as sent by the server).
  final List<TrackingEvent> events;

  const ShipmentTracking({this.trackingStatus, this.rtoAt, this.events = const []});

  /// Reads the Sprint 8 tracking fields from one shipment map.
  factory ShipmentTracking.fromShipment(Map<String, dynamic> shipment) => ShipmentTracking(
        trackingStatus: _nonEmpty(shipment['tracking_status']),
        rtoAt: _asDateTime(shipment['rto_at']),
        events: asMapList(shipment['tracking']).map(TrackingEvent.fromJson).toList(),
      );

  bool get isReturning => rtoAt != null || trackingStatus == 'rto';

  bool get hasData => trackingStatus != null || rtoAt != null || events.isNotEmpty;
}
