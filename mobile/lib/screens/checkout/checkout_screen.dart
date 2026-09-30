import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../providers/address_provider.dart';
import '../../providers/cart_provider.dart';
import '../../services/api_service.dart';
import '../../services/checkout_api.dart';
import 'checkout_flow.dart';
import 'checkout_razorpay.dart';
import 'widgets/checkout_bottom_button.dart';
import 'widgets/checkout_step_bar.dart';
import 'widgets/checkout_step_body.dart';
import 'widgets/prescription_step.dart' show pickPrescriptionImage;

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
  PlacedOrder? _order; // set once POST /orders succeeds
  XFile? _prescriptionFile;
  String? _savedPrescriptionId;
  List<dynamic> _savedPrescriptions = [];
  bool _isLoading = false;
  late final CheckoutRazorpay _razorpay;

  @override
  void initState() {
    super.initState();
    _razorpay = CheckoutRazorpay(onSuccess: _onPaymentSuccess, onError: _onPaymentError);
    _loadPrescriptions();
  }

  @override
  void dispose() {
    _razorpay.dispose();
    super.dispose();
  }

  String? get _orderId => _order?.id;

  bool get _requiresPrescription =>
      _order?.requiresPrescription ?? ref.read(cartProvider).view.requiresPrescription;

  Future<void> _loadPrescriptions() async {
    try {
      final verified = await apiService.getVerifiedPrescriptions();
      if (!mounted) return;
      setState(() => _savedPrescriptions = verified);
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
    final address = _selectedAddress(ref.read(addressesProvider).valueOrNull ?? const []);
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
      final data = await apiService.placeOrder(
        addressId: address['id'],
        items: lines
            .map((l) => <String, dynamic>{'product_id': l.productId, 'quantity': l.quantity})
            .toList(),
        couponCode: coupon != null && coupon.valid ? coupon.code : null,
        pincode: address['pincode']?.toString() ?? '',
      );
      if (!mounted) return;
      // The server removed the ordered lines from the cart.
      ref.read(cartProvider.notifier).load();
      final order = PlacedOrder.fromJson(data);
      setState(() {
        _order = order;
        _step = order.requiresPrescription ? CheckoutStep.prescription : CheckoutStep.payment;
      });
    } catch (e) {
      _showError(ApiService.errorMessage(e, fallback: 'Failed to create order'));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Step 2: Upload prescription ─────────────────────────────────────────────
  Future<void> _pickPrescription() async {
    final file = await pickPrescriptionImage(context);
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
        await apiService.uploadOrderPrescription(
            filePath: file.path, filename: file.name, orderId: orderId);
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
      final data = await apiService.createPaymentOrder(_orderId!);
      _razorpay.open(data, orderNumber: _order?.orderNumber);
    } catch (e) {
      _showError(ApiService.errorMessage(e, fallback: 'Payment error'));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _onPaymentSuccess(PaymentSuccessResponse response) async {
    try {
      await apiService.verifyPayment(
        razorpayOrderId: response.orderId,
        razorpayPaymentId: response.paymentId,
        razorpaySignature: response.signature,
        orderId: _orderId,
      );
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
              steps: checkoutBarLabels(hasRx),
              currentIndex: _step.barIndex(hasRx),
            ),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: CheckoutStepBody(
                step: _step,
                addresses: addresses,
                selectedAddressId: _selectedAddressId,
                onSelectAddress: (id) => setState(() => _selectedAddressId = id),
                prescriptionFile: _prescriptionFile,
                savedPrescriptions: _savedPrescriptions,
                savedPrescriptionId: _savedPrescriptionId,
                onPickFile: _pickPrescription,
                onSelectSaved: (id) => setState(() {
                  _savedPrescriptionId = id;
                  _prescriptionFile = null;
                }),
                order: _order,
              ),
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
    return CheckoutBottomButton(
        label: _step.buttonLabel(_order?.totalPaise ?? 0), onPressed: action, isLoading: _isLoading);
  }
}
