import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/checkout_summary.dart';
import '../../providers/address_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/cart_provider.dart';
import '../../services/api_service.dart';
import '../../services/checkout_api.dart';
import '../../services/payment_api.dart';
import '../../utils/formatters.dart';
import 'checkout_flow.dart';
import 'checkout_prescription.dart';
import 'checkout_razorpay.dart';
import 'widgets/checkout_bottom_button.dart';
import 'widgets/checkout_step_bar.dart';
import 'widgets/checkout_step_body.dart';
import 'widgets/prescription_step.dart' show pickPrescriptionImage;

/// Checkout: address → review (C-35) → (prescription) → payment → confirmed.
/// Items, coupon and prices come from the server cart; the summary and the
/// order total come from the server. The pincode is the selected address's.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  CheckoutStep _step = CheckoutStep.address;
  String? _selectedAddressId;
  CheckoutSummary? _summary; // POST /orders/preview, in memory only
  bool _declared = false; // practitioner declaration, unticked by default (C-15)
  PlacedOrder? _order; // set once POST /orders succeeds
  final _rx = CheckoutPrescription();
  bool _isLoading = false;
  late final CheckoutRazorpay _razorpay;
  PaymentOptions? _payOptions; // GET /payments/options (Sprint 26)
  String _demoMethod = 'upi';
  String? _payNotice;
  bool _paidDemo = false;
  List<String> _rxItems = const []; // the order's prescription lines, kept when the cart empties

  @override
  void initState() {
    super.initState();
    _razorpay = CheckoutRazorpay(
      onPaid: _onPaid,
      onError: _showError,
      onBusy: (busy) {
        if (mounted) setState(() => _isLoading = busy);
      },
    );
    _rx.loadSaved().then((_) {
      if (mounted) setState(() {});
    });
    apiService.getPaymentOptions().then((o) {
      if (mounted) setState(() => _payOptions = o);
    });
  }

  @override
  void dispose() {
    _razorpay.dispose();
    super.dispose();
  }

  bool get _requiresPrescription =>
      _order?.requiresPrescription ?? ref.read(cartProvider).view.requiresPrescription;

  bool get _isPractitioner => ref.read(authProvider).customerType == 'doc_hospital';

  /// Order body for the selected address and the server cart, or null
  /// (with a message) when something is missing.
  Map<String, dynamic>? _orderBody({bool? declaration}) {
    Map<String, dynamic>? address;
    for (final a in ref.read(addressesProvider).valueOrNull ?? const <Map<String, dynamic>>[]) {
      if (a['id']?.toString() == _selectedAddressId) address = a;
    }
    if (address == null) {
      _showError('Please select a delivery address');
      return null;
    }
    final cart = ref.read(cartProvider).view;
    if (cart.orderableItems.isEmpty) {
      _showError('Your cart has no items that can be ordered');
      return null;
    }
    return checkoutOrderBody(cart, address, practitionerDeclaration: declaration);
  }

  /// Runs [request] with the button spinner and shows its error, if any.
  Future<void> _busy(Future<void> Function() request, String fallback) async {
    setState(() => _isLoading = true);
    try {
      await request();
    } catch (e) {
      _showError(ApiService.errorMessage(e, fallback: fallback));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Step 1 → 2: checkout summary (C-35) ───────────────────────────────────
  Future<void> _review() async {
    if (_order != null && _summary != null) {
      setState(() => _step = CheckoutStep.review); // already placed; nothing to redo
      return;
    }
    final body = _orderBody();
    if (body == null) return;
    await _busy(() async {
      final summary = await apiService.previewOrder(body);
      if (!mounted) return;
      setState(() {
        _summary = summary;
        _step = CheckoutStep.review;
      });
    }, 'Could not prepare your order summary');
  }

  // ── Step 2: place the order ───────────────────────────────────────────────
  Future<void> _placeOrder() async {
    if (_order != null) {
      // Never create a second order.
      setState(() => _step = _requiresPrescription ? CheckoutStep.prescription : CheckoutStep.payment);
      return;
    }
    final practitioner = _isPractitioner;
    if (practitioner && !_declared) {
      _showError('Please tick the declaration to place this order');
      return;
    }
    final body = _orderBody(declaration: practitioner ? true : null);
    if (body == null) return;
    _rxItems = ref.read(cartProvider).view.orderableItems
        .where((l) => l.requiresPrescription)
        .map((l) => '${l.name} × ${l.quantity}')
        .toList();
    await _busy(() async {
      final data = await apiService.placeOrder(body);
      if (!mounted) return;
      ref.read(cartProvider.notifier).load(); // the server removed the ordered lines
      final order = PlacedOrder.fromJson(data);
      setState(() {
        _order = order;
        _step = order.requiresPrescription ? CheckoutStep.prescription : CheckoutStep.payment;
      });
    }, 'Failed to create order');
  }

  // ── Step 3: prescription ──────────────────────────────────────────────────
  Future<void> _pickPrescription() async {
    final file = await pickPrescriptionImage(context);
    if (file != null && mounted) setState(() => _rx.pick(file));
  }

  Future<void> _uploadPrescription() async {
    if (!_rx.hasChoice) {
      _showError('Please upload a prescription or select a saved one');
      return;
    }
    final orderId = _order?.id;
    if (orderId == null) return; // this step only follows POST /orders
    // Photo upload or saved-Rx use-for-order (C-08); the pharmacist confirms
    // either. Server 400s (expired, "does not cover: …") are shown as-is.
    var ok = false;
    await _busy(() async {
      await _rx.submit(orderId);
      ok = true;
    }, _rx.file != null ? 'Upload failed' : 'Could not use this prescription');
    if (ok && mounted) setState(() => _step = CheckoutStep.payment);
  }

  // ── Step 4: payment ───────────────────────────────────────────────────────
  void _onPaid() {
    if (!mounted) return;
    ref.read(cartProvider.notifier).load();
    setState(() => _step = CheckoutStep.confirmed);
  }

  /// Trial server without Razorpay keys: a labelled demo payment, no money moves.
  Future<void> _payDemo({bool fail = false}) async {
    final orderId = _order?.id;
    if (orderId == null) return;
    setState(() => _payNotice = null);
    var paid = false;
    await _busy(() async {
      paid = await apiService.payOrderDemo(orderId, method: _demoMethod, fail: fail);
    }, 'We could not record the demo payment. Please try again.');
    if (!mounted) return;
    if (paid) {
      _paidDemo = true;
      _onPaid();
    } else {
      setState(() => _payNotice = 'Demo payment failed (simulated). No money was taken. Your order is saved — tap “Pay (demo)” to try again.');
    }
  }

  String _payLabel() {
    final total = formatPrice(_order?.totalPaise ?? 0);
    final o = _payOptions;
    if (o == null) return 'Getting payment options…';
    if (o.isDemo) return 'Pay $total (demo)';
    if (o.isRazorpay) return 'Pay $total securely';
    return 'Online payment not available';
  }

  VoidCallback? _payAction() {
    final o = _payOptions;
    if (o == null) return null;
    if (o.isDemo) return () => _payDemo();
    if (o.isRazorpay) return () => _razorpay.pay(_order?.id ?? '', orderNumber: _order?.orderNumber);
    return null;
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.red));
  }

  void _onBack() {
    final previous = switch (_step) {
      CheckoutStep.review => CheckoutStep.address,
      CheckoutStep.prescription => CheckoutStep.review,
      CheckoutStep.payment => _requiresPrescription ? CheckoutStep.prescription : CheckoutStep.review,
      _ => null,
    };
    if (previous == null) {
      context.pop();
    } else {
      setState(() => _step = previous);
    }
  }

  @override
  Widget build(BuildContext context) {
    final addresses = ref.watch(addressesProvider).valueOrNull ?? const <Map<String, dynamic>>[];
    if (_selectedAddressId == null && addresses.isNotEmpty) {
      _selectedAddressId = addresses.first['id']?.toString();
    }
    ref.watch(cartProvider.select((s) => s.view.requiresPrescription));
    final isPractitioner = ref.watch(authProvider.select((s) => s.customerType == 'doc_hospital'));
    final hasRx = _requiresPrescription;
    final confirmed = _step == CheckoutStep.confirmed;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout'),
        leading: confirmed ? const SizedBox.shrink() : BackButton(onPressed: _onBack),
      ),
      body: Column(
        children: [
          if (!confirmed)
            CheckoutStepBar(steps: checkoutBarLabels(hasRx), currentIndex: _step.barIndex(hasRx)),
          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: CheckoutStepBody(
                step: _step,
                addresses: addresses,
                selectedAddressId: _selectedAddressId,
                // A new address needs a new summary (sellers and delivery depend on it).
                onSelectAddress: (id) => setState(() {
                  _selectedAddressId = id;
                  if (_order == null) _summary = null;
                }),
                summary: _summary,
                isPractitioner: isPractitioner,
                declared: _declared,
                onDeclared: (v) => setState(() => _declared = v),
                prescriptionFile: _rx.file,
                savedPrescriptions: _rx.saved,
                savedPrescriptionId: _rx.savedId,
                onPickFile: _pickPrescription,
                onSelectSaved: (id) => setState(() => _rx.selectSaved(id)),
                order: _order,
                rxItems: _rxItems,
                paymentOptions: _payOptions,
                demoMethod: _demoMethod,
                onDemoMethod: (m) => setState(() => _demoMethod = m),
                onSimulateFailure: _isLoading ? null : () => _payDemo(fail: true),
                prescriptionLabel: _requiresPrescription ? _rx.label : null,
                paymentNotice: _payNotice,
                paidDemo: _paidDemo,
              ),
            ),
          ),
          if (!confirmed)
            CheckoutBottomButton(
              label: _step == CheckoutStep.payment
                  ? _payLabel()
                  : _step.buttonLabel(totalPaise: _order?.totalPaise ?? 0, orderPlaced: _order != null),
              onPressed: switch (_step) {
                CheckoutStep.address => _review,
                CheckoutStep.review => _placeOrder,
                CheckoutStep.prescription => _uploadPrescription,
                CheckoutStep.payment => _payAction(),
                CheckoutStep.confirmed => null,
              },
              isLoading: _isLoading,
            ),
        ],
      ),
    );
  }
}
