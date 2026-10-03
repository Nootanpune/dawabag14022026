/// Sprint 38: the emergency stop for prescription-medicine sales (owner decision
/// 2026-10-03; Rulebook C-08, C-46), from the public GET /sales-status:
/// `{ rx_sales: 'open' | 'paused', message, reference, since }`.
/// Asked from the server each time a screen opens; never stored on the phone.
class SalesStatus {
  final bool rxPaused;
  /// The buyer's text, reference included (server's customerMessage); null when open.
  final String? message;
  final String? reference;
  final String? since;

  const SalesStatus({this.rxPaused = false, this.message, this.reference, this.since});

  static const SalesStatus open = SalesStatus();

  factory SalesStatus.fromJson(Map<String, dynamic> j) {
    final paused = j['rx_sales']?.toString() == 'paused';
    String? s(String k) {
      final v = j[k]?.toString().trim();
      return v == null || v.isEmpty ? null : v;
    }

    return SalesStatus(
      rxPaused: paused,
      message: paused ? (s('message') ?? kDefaultRxPausedMessage) : null,
      reference: s('reference'),
      since: s('since'),
    );
  }
}

/// Same words as the server's DEFAULT_PUBLIC_MESSAGE, used only if a paused
/// answer arrives without its text.
const kDefaultRxPausedMessage =
    'Orders for prescription medicines are paused for now. You can still order other products.';
