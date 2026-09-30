import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../providers/address_provider.dart';
import '../../providers/cart_provider.dart';
import '../../services/api_service.dart';
import '../../utils/formatters.dart';
import 'widgets/address_step.dart';
import 'widgets/checkout_step_bar.dart';
import 'widgets/confirmed_step.dart';
import 'widgets/payment_step.dart';
import 'widgets/prescription_step.dart';

enum CheckoutStep { address, prescription, payment, confirmed }

/// Checkout: address → (prescription) → payment → confirmed.
/// Items, coupon and prices come from the server cart; the order total comes
/// from the server's order response. The pincode is the selected address's.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  CheckoutStep _step = CheckoutStep.address;
  String? _selectedAddressId;
  String? _orderId;
  String? _orderNumber;
  int _orderTotalPaise = 0;
  bool? _orderRequiresPrescription;
  XFile? _prescriptionFile;
  String? _savedPrescriptionId;
  List<dynamic> _savedPrescriptions = [];
  bool _isLoading = false;
  late Razorpay _razorpay;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onPaymentSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onPaymentError);
    _loadPrescriptions();
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  bool get _requiresPrescription =>
      _orderRequiresPrescription ?? ref.read(cartProvider).view.requiresPrescription;

  Future<void> _loadPrescriptions() async {
    try {
      final res = await apiService.dio.get('/prescriptions/my');
      if (!mounted) return;
      setState(() {
        _savedPrescriptions = (res.data['data'] as List)
            .where((p) => p['status'] == 'verified')
            .toList();
      });
    } catch (_) {}
  }

  Map<String, dynamic>? _selectedAddress(List<Map<String, dynamic>> addresses) {
    for (final a in addresses) {
      if (a['id']?.toString() == _selectedAddressId) return a;
    }
    return null;
  }

  // ── Step 1: Create order ────────────────────────────────────────────────────
  Future<void> _createOrder() async {
    if (_orderId != null) {
      // Order already placed (user came back); do not create a second one.
      setState(() => _step = _requiresPrescription ? CheckoutStep.prescription : CheckoutStep.payment);
      return;
    }
    final addresses = ref.read(addressesProvider).valueOrNull ?? const [];
    final address = _selectedAddress(addresses);
    if (address == null) {
      _showError('Please select a delivery address');
      return;
    }
    final cart = ref.read(cartProvider).view;
    final lines = cart.orderableItems;
    if (lines.isEmpty) {
      _showError('Your cart has no items that can be ordered');
      return;
    }
    final coupon = cart.coupon;
    setState(() => _isLoading = true);
    try {
      final res = await apiService.dio.post('/orders', data: {
        'address_id': address['id'],
        'items': lines.map((l) => {'product_id': l.productId, 'quantity': l.quantity}).toList(),
        if (coupon != null && coupon.valid) 'coupon_code': coupon.code,
        'pincode': address['pincode']?.toString() ?? '',
      });
      final order = ApiService.dataOf(res)['order'];
      final data = order is Map ? Map<String, dynamic>.from(order) : <String, dynamic>{};
      if (!mounted) return;
      // The server removed the ordered lines from the cart.
      ref.read(cartProvider.notifier).load();
      final total = data['total_paise'];
      setState(() {
        _orderId = data['id']?.toString();
        _orderNumber = data['order_number']?.toString();
        _orderTotalPaise = total is num ? total.round() : 0;
        _orderRequiresPrescription = data['requires_prescription'] == true;
        _step = _orderRequiresPrescription == true
            ? CheckoutStep.prescription
            : CheckoutStep.payment;
      });
    } catch (e) {
      _showError(ApiService.errorMessage(e, fallback: 'Failed to create order'));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Step 2: Upload prescription ─────────────────────────────────────────────
  Future<void> _pickPrescription() async {
    final picker = ImagePicker();
    final source = await showPrescriptionSourceSheet(context);
    if (source == null) return;
    final file = await picker.pickImage(source: source, imageQuality: 85);
    if (file != null && mounted) {
      setState(() {
        _prescriptionFile = file;
        _savedPrescriptionId = null;
      });
    }
  }

  Future<void> _uploadPrescription() async {
    final file = _prescriptionFile;
    final orderId = _orderId;
    if (file == null && _savedPrescriptionId == null) {
      _showError('Please upload a prescription or select a saved one');
      return;
    }
    if (file != null && orderId != null) {
      setState(() => _isLoading = true);
      try {
        final formData = FormData.fromMap({
          'prescription': await MultipartFile.fromFile(file.path, filename: file.name),
          'order_id': orderId,
        });
        await apiService.dio.post('/prescriptions/upload', data: formData);
      } catch (e) {
        _showError(ApiService.errorMessage(e, fallback: 'Upload failed'));
        return;
      } finally {
        if (mounted) setState(() => _isLoading = false);
      }
    }
    if (mounted) setState(() => _step = CheckoutStep.payment);
  }

  // ── Step 3: Razorpay payment ─────────────────────────────────────────────────
  Future<void> _initiatePayment() async {
    if (_orderId == null) return;
    setState(() => _isLoading = true);
    try {
      final res = await apiService.dio.post('/payments/create-order', data: {'order_id': _orderId});
      final data = res.data['data'];
      _razorpay.open({
        'key': data['razorpay_key_id'],
        'amount': data['amount'],
        'currency': 'INR',
        'name': 'Dawabag',
        'description': 'Order $_orderNumber',
        'order_id': data['razorpay_order_id'],
        'prefill': {'contact': '', 'email': ''},
        'theme': {'color': '#1A8856'},
      });
    } catch (e) {
      _showError(ApiService.errorMessage(e, fallback: 'Payment error'));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _onPaymentSuccess(PaymentSuccessResponse response) async {
    try {
      await apiService.dio.post('/payments/verify', data: {
        'razorpay_order_id': response.orderId,
        'razorpay_payment_id': response.paymentId,
        'razorpay_signature': response.signature,
        'order_id': _orderId,
      });
      if (!mounted) return;
      ref.read(cartProvider.notifier).load();
      setState(() => _step = CheckoutStep.confirmed);
    } catch (_) {
      _showError('Payment verification failed. Contact support.');
    }
  }

  void _onPaymentError(PaymentFailureResponse response) {
    _showError('Payment failed: ${response.message}');
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: Colors.red),
    );
  }

  void _onBack() {
    if (_step == CheckoutStep.prescription) {
      setState(() => _step = CheckoutStep.address);
    } else if (_step == CheckoutStep.payment) {
      setState(() => _step =
          _requiresPrescription ? CheckoutStep.prescription : CheckoutStep.address);
    } else {
      context.pop();
    }
  }

  @override
  Widget build(BuildContext context) {
    final addresses = ref.watch(addressesProvider).valueOrNull ?? const <Map<String, dynamic>>[];
    if (_selectedAddressId == null && addresses.isNotEmpty) {
      _selectedAddressId = addresses.first['id']?.toString();
    }
    ref.watch(cartProvider.select((s) => s.view.requiresPrescription));
    final hasRx = _requiresPrescription;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout'),
        leading: _step == CheckoutStep.confirmed
            ? const SizedBox.shrink()
            : BackButton(onPressed: _onBack),
      ),
      body: Column(
        children: [
          if (_step != CheckoutStep.confirmed)
            CheckoutStepBar(
              steps: hasRx ? const ['Address', 'Prescription', 'Payment'] : const ['Address', 'Payment'],
              currentIndex: switch (_step) {
                CheckoutStep.address => 0,
                CheckoutStep.prescription => 1,
                CheckoutStep.payment => hasRx ? 2 : 1,
                CheckoutStep.confirmed => -1,
              },
            ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: switch (_step) {
                CheckoutStep.address => AddressStep(
                    addresses: addresses,
                    selectedId: _selectedAddressId,
                    onSelect: (id) => setState(() => _selectedAddressId = id),
                  ),
                CheckoutStep.prescription => PrescriptionStep(
                    prescriptionFile: _prescriptionFile,
                    savedPrescriptions: _savedPrescriptions,
                    selectedSavedId: _savedPrescriptionId,
                    onPickFile: _pickPrescription,
                    onSelectSaved: (id) => setState(() {
                      _savedPrescriptionId = id;
                      _prescriptionFile = null;
                    }),
                  ),
                CheckoutStep.payment => PaymentStep(
                    orderNumber: _orderNumber ?? '',
                    totalPaise: _orderTotalPaise,
                  ),
                CheckoutStep.confirmed => ConfirmedStep(orderNumber: _orderNumber ?? ''),
              },
            ),
          ),
          if (_step != CheckoutStep.confirmed) _bottomButton(),
        ],
      ),
    );
  }

  Widget _bottomButton() {
    final VoidCallback? action = switch (_step) {
      CheckoutStep.address => _createOrder,
      CheckoutStep.prescription => _uploadPrescription,
      CheckoutStep.payment => _initiatePayment,
      CheckoutStep.confirmed => null,
    };
    final label = switch (_step) {
      CheckoutStep.address => 'Continue',
      CheckoutStep.prescription => 'Continue to payment',
      CheckoutStep.payment => 'Pay ${formatPrice(_orderTotalPaise)} securely',
      CheckoutStep.confirmed => '',
    };
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
        child: ElevatedButton(
          onPressed: _isLoading ? null : action,
          child: _isLoading
              ? const SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
              : Text(label),
        ),
      ),
    );
  }
}
