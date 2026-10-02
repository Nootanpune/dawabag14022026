import 'package:file_picker/file_picker.dart';
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
import '../../services/prescription_api.dart';
import '../../utils/formatters.dart';
import '../../widgets/payments/demo_checkout/demo_checkout.dart';
import 'checkout_flow.dart';
import 'checkout_prescription.dart';
import 'checkout_razorpay.dart';
import 'widgets/checkout_bottom_button.dart';
import 'widgets/checkout_step_bar.dart';
import 'widgets/checkout_step_body.dart';
import 'widgets/prescription_step.dart' show pickPrescriptionImage;

/// Checkout, in the web's order (Sprint 32): address → prescription (Rx orders,
/// chosen before the order exists, C-08) → review (C-35) → place order, then the
/// chosen prescription is sent with it → payment → confirmed. Items, coupon and
/// prices come from the server cart; the summary and totals from the server.
class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  static const _maxRxBytes = 10 * 1024 * 1024; // what the server accepts

  CheckoutStep _step = CheckoutStep.address;
  String? _selectedAddressId;
  CheckoutSummary? _summary; // POST /orders/preview, in memory only
  bool _declared = false; // practitioner declaration, unticked by default (C-15)
  PlacedOrder? _order; // set once POST /orders succeeds
  final _rx = CheckoutPrescription();
  bool _rxLoading = true;
  bool _uploading = false;
  String? _rxError; // the chosen prescription could not go with the placed order
  bool _isLoading = false;
  late final CheckoutRazorpay _razorpay;
  PaymentOptions? _payOptions; // GET /payments/options (Sprint 26)
  String? _payNotice;
  bool _paidDemo = false;
  String? _paidBy; // in memory only: how the demo payment was made
  List<String> _orderedRxItems = const []; // the order's prescription lines, kept when the cart empties

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
    _loadPrescriptions();
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

  /// "Amoxicillin 500 mg Capsule × 1" for each cart line that needs a prescription.
  List<String> _cartRxItems() => ref
      .read(cartProvider)
      .view
      .orderableItems
      .where((l) => l.requiresPrescription)
      .map((l) => '${l.name} × ${l.quantity}')
      .toList();

  Future<void> _loadPrescriptions() async {
    if (mounted) setState(() => _rxLoading = true);
    await _rx.loadSaved();
    if (mounted) setState(() => _rxLoading = false);
  }

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

  // ── Step 1: address → prescription (Rx) or review ─────────────────────────
  void _continueFromAddress() {
    if (_orderBody() == null) return;
    if (_requiresPrescription) {
      setState(() => _step = CheckoutStep.prescription);
      _loadPrescriptions(); // uploads made elsewhere since the screen opened
    } else {
      _goToReview();
    }
  }

  // ── Step 2: prescription chosen → review ──────────────────────────────────
  void _continueFromPrescription() {
    if (!_rx.hasChoice) {
      _showError('Please choose or upload a prescription');
      return;
    }
    _goToReview();
  }

  /// Fetches the checkout summary (C-35) and shows the review.
  Future<void> _goToReview() async {
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

  // ── Step 3: place the order, then send the chosen prescription with it ────
  Future<void> _placeOrder() async {
    if (_order != null) {
      setState(() => _step = CheckoutStep.payment); // never create a second order
      return;
    }
    final practitioner = _isPractitioner;
    if (practitioner && !_declared) {
      _showError('Please tick the declaration to place this order');
      return;
    }
    final body = _orderBody(declaration: practitioner ? true : null);
    if (body == null) return;
    _orderedRxItems = _cartRxItems();
    await _busy(() async {
      final outcome = await placeOrderThenAttachRx(
        place: () async => PlacedOrder.fromJson(await apiService.placeOrder(body)),
        attach: _rx.attachTo,
        rxChosen: _rx.hasChoice,
        errorText: (e) => ApiService.errorMessage(e, fallback: 'This prescription could not be used.'),
      );
      if (!mounted) return;
      ref.read(cartProvider.notifier).load(); // the server removed the ordered lines
      setState(() {
        _order = outcome.order;
        _step = outcome.next;
        _rxError = outcome.rxError;
      });
    }, 'We could not place your order. Please try again.');
  }

  // ── The order is placed but its prescription was refused: choose again ───
  Future<void> _retryAttach() async {
    final order = _order;
    if (order == null) return;
    await _busy(() async {
      final outcome = await attachRxToPlacedOrder(
        order,
        attach: _rx.attachTo,
        rxChosen: _rx.hasChoice,
        errorText: (e) => ApiService.errorMessage(e, fallback: 'This prescription could not be used.'),
      );
      if (!mounted) return;
      setState(() {
        _step = outcome.next;
        _rxError = outcome.rxError;
      });
    }, 'Could not send the prescription');
  }

  void _choosePrescription(String id) => setState(() {
        _rx.select(id);
        _rxError = null;
      });

  /// A new prescription goes straight to the server (no order yet) and is chosen.
  Future<void> _uploadNew(String path, String name) async {
    setState(() => _uploading = true);
    try {
      await _rx.uploadNew(filePath: path, filename: name);
      if (!mounted) return;
      setState(() => _rxError = null);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Prescription uploaded and chosen')));
    } catch (e) {
      _showError(ApiService.errorMessage(e, fallback: 'Upload failed. Please try again.'));
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _uploadPhoto() async {
    final file = await pickPrescriptionImage(context);
    if (file == null) return;
    if (await file.length() > _maxRxBytes) return _showError('This photo is larger than 10 MB.');
    await _uploadNew(file.path, file.name);
  }

  Future<void> _uploadPdf() async {
    FilePickerResult? result;
    try {
      result = await FilePicker.platform.pickFiles(type: FileType.custom, allowedExtensions: const ['pdf']);
    } catch (_) {
      return _showError('Could not open the file picker');
    }
    final file = result?.files.firstOrNull;
    if (file == null || file.path == null) return;
    if (file.size > _maxRxBytes) return _showError('${file.name} is larger than 10 MB.');
    await _uploadNew(file.path!, file.name);
  }

  // ── Step 4: payment ───────────────────────────────────────────────────────
  void _onPaid() {
    if (!mounted) return;
    ref.read(cartProvider.notifier).load();
    setState(() => _step = CheckoutStep.confirmed);
  }

  /// Trial server without Razorpay keys: the demo checkout (no money moves) calls
  /// this from its last screen. A decline is shown by the demo checkout itself.
  Future<bool> _payDemo(DemoChoice choice, bool success) async {
    final orderId = _order?.id;
    if (orderId == null) return false;
    setState(() => _payNotice = null);
    final paid = await apiService.payOrderDemo(orderId, method: choice.method, provider: choice.provider, fail: !success);
    if (paid && mounted) {
      _paidDemo = true;
      _paidBy = paidByLabel(choice);
      _onPaid();
    }
    return paid;
  }

  String _payLabel() {
    final total = formatPrice(_order?.totalPaise ?? 0);
    final o = _payOptions;
    if (o == null) return 'Getting payment options…';
    if (o.isRazorpay) return 'Pay $total securely';
    return 'Online payment not available';
  }

  VoidCallback? _payAction() {
    final o = _payOptions;
    if (o == null) return null;
    if (o.isRazorpay) return () => _razorpay.pay(_order?.id ?? '', orderNumber: _order?.orderNumber);
    return null;
  }

  void _showError(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg), backgroundColor: Colors.red));
  }

  void _onBack() {
    final previous = checkoutPreviousStep(_step, hasRx: _requiresPrescription, orderPlaced: _order != null);
    if (previous != null) {
      setState(() => _step = previous);
    } else if (_step == CheckoutStep.rxFix) {
      context.go('/orders'); // the order is saved; it can get a prescription from there
    } else {
      context.pop();
    }
  }

  VoidCallback? _bottomAction() => switch (_step) {
        CheckoutStep.address => _continueFromAddress,
        CheckoutStep.prescription => _rx.hasChoice ? _continueFromPrescription : null,
        CheckoutStep.review => _placeOrder,
        CheckoutStep.rxFix => _rx.hasChoice ? _retryAttach : null,
        CheckoutStep.payment => _payAction(),
        CheckoutStep.confirmed => null,
      };

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
                prescriptions: _rx.saved,
                prescriptionsLoading: _rxLoading,
                chosenPrescriptionId: _rx.selectedId,
                onChoosePrescription: _choosePrescription,
                onUploadPhoto: _uploadPhoto,
                onUploadPdf: _uploadPdf,
                uploading: _uploading,
                rxError: _rxError,
                loadRxLink: apiService.prescriptionLink,
                onChangeRx: () => setState(() => _step = CheckoutStep.prescription),
                order: _order,
                rxItems: _order != null ? _orderedRxItems : _cartRxItems(),
                paymentOptions: _payOptions,
                onDemoPay: _payDemo,
                prescriptionLabel: hasRx ? _rx.label : null,
                paymentNotice: _payNotice,
                paidDemo: _paidDemo,
                paidBy: _paidBy,
              ),
            ),
          ),
          // The demo checkout has its own Pay / Approve buttons
          if (!confirmed && !(_step == CheckoutStep.payment && (_payOptions?.isDemo ?? false)))
            CheckoutBottomButton(
              label: _step == CheckoutStep.payment
                  ? _payLabel()
                  : _step.buttonLabel(
                      totalPaise: _order?.totalPaise ?? 0,
                      orderPlaced: _order != null,
                      hasRx: hasRx,
                      rxChosen: _rx.hasChoice,
                    ),
              onPressed: _bottomAction(),
              isLoading: _isLoading,
            ),
        ],
      ),
    );
  }
}
