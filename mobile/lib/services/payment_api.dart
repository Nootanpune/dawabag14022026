import '../models/payment_result.dart';
import 'api_service.dart';
import 'api_utils.dart';

/// How the server takes payment (Sprint 26): 'razorpay' (keys set), 'demo' (the
/// owner's trial server without keys — no money moves) or 'unavailable'.
class PaymentOptions {
  final String mode;
  final List<String> methods;
  /// The demo checkout's banks and wallets ({netbanking: [...], wallet: [...]}), demo mode only
  final Map<String, List<String>> providers;
  const PaymentOptions({this.mode = 'unavailable', this.methods = const [], this.providers = const {}});

  bool get isRazorpay => mode == 'razorpay';
  bool get isDemo => mode == 'demo';

  factory PaymentOptions.fromJson(Map<String, dynamic> j) => PaymentOptions(
        mode: j['mode']?.toString() ?? 'unavailable',
        methods: (j['methods'] is List) ? (j['methods'] as List).map((e) => e.toString()).toList() : const [],
        providers: (j['providers'] is Map)
            ? {
                for (final e in (j['providers'] as Map).entries)
                  if (e.value is List) e.key.toString(): (e.value as List).map((v) => v.toString()).toList(),
              }
            : const {},
      );
}

/// Plain names for the ways to pay.
const paymentMethodLabels = {
  'upi': ('UPI', 'Google Pay, PhonePe, Paytm, BHIM'),
  'card': ('Card', 'Debit or credit card'),
  'netbanking': ('Netbanking', 'All major banks'),
  'wallet': ('Wallet', 'Paytm, Mobikwik and others'),
};

extension PaymentApi on ApiService {
  /// GET /payments/options. Failures read as "not available".
  Future<PaymentOptions> getPaymentOptions() async {
    try {
      final res = await dio.get('/payments/options');
      return PaymentOptions.fromJson(apiData(res));
    } catch (_) {
      return const PaymentOptions();
    }
  }

  /// POST /payments/demo — trial only; the server records it through the same
  /// path as a Razorpay payment. Sprint 39: a prescription order is only
  /// authorised (simulated) until the pharmacist's check — `payment_status`
  /// 'authorized' — and 422 PRESCRIPTION_REQUIRED while it has no prescription.
  /// [provider]: the bank or wallet chosen (never card data); kept in the audit only.
  Future<PaymentResult> payOrderDemo(String orderId, {required String method, String? provider, bool fail = false}) async {
    final res = await dio.post('/payments/demo', data: {
      'order_id': orderId,
      'method': method,
      if (provider != null) 'provider': provider,
      'outcome': fail ? 'failure' : 'success',
    });
    return PaymentResult.fromDemo(apiData(res));
  }

  /// POST /consultations/:id/pay/demo — trial only.
  Future<bool> payConsultationDemo(String consultationId, {required String method, String? provider, bool fail = false}) async {
    final res = await dio.post('/consultations/${Uri.encodeComponent(consultationId)}/pay/demo',
        data: {'method': method, if (provider != null) 'provider': provider, 'outcome': fail ? 'failure' : 'success'});
    return apiData(res)['paid'] == true;
  }
}
