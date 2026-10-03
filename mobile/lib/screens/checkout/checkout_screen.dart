import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/checkout_summary.dart';
import '../../models/payment_result.dart';
import '../../providers/address_provider.dart';
import '../../providers/auth_provider.dart';
import '../../providers/cart_provider.dart';
import '../../providers/practitioner_provider.dart';
import '../../providers/sales_status_provider.dart';
import '../../services/api_service.dart';
import '../../services/api_utils.dart';
import '../../services/checkout_api.dart';
import '../../services/payment_api.dart';
import '../../services/prescription_api.dart';
import '../../utils/payment_hold.dart';
import '../../widgets/payments/demo_checkout/demo_checkout.dart';
import '../../widgets/practitioner/registration_status_card.dart';
import '../../widgets/rx_sales_banner.dart';
import '../../widgets/trade_price_banner.dart';
import 'checkout_flow.dart';
import 'checkout_prescription.dart';
import 'checkout_razorpay.dart';
import 'widgets/checkout_bottom_button.dart';
import 'widgets/checkout_step_bar.dart';
import 'widgets/checkout_step_body.dart';
import 'widgets/prescription_step.dart' show pickPrescriptionImage;

/// Checkout, in the web's order: address → prescription (Rx orders, chosen
/// before the order exists, C-08) → review (C-35) → written order (Sprint 44:
/// doctors / institutions, r.65(9)(b)) → place order WITH the chosen
/// prescription / written order (POST /orders + prescription_id /
/// written_order_id; the server refuses the order without them) → payment (only
/// held until the pharmacist's check for a prescription order, C-37) →
/// confirmed. A doctor / institution whose registration does not allow sales
/// now sees the server's reason and cannot continue. Items, coupon and prices
/// come from the server cart; the summary and totals from the server.
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
  String? _rxError; // the server refused the order or its payment over the prescription
  bool _isLoading = false;
  late final CheckoutRazorpay _razorpay;
  PaymentOptions? _payOptions; // GET /payments/options (Sprint 26)
  String? _payNotice;
  bool _paidDemo = false;
  String? _paidBy; // in memory only: how the demo payment was made
  bool _paidAuthorised = false; // Sprint 39: held, not charged, until the pharmacist's check
  String? _chargeNote; // the server's charge_note, when it sent one
  List<String> _orderedRxItems = const []; // the order's prescription lines, kept when the cart empties
  // Sprint 44: a doctor's / institution's signed written order — held by the server, only its id here
  String? _writtenOrderId;
  String? _writtenOrderError;
  bool _writtenAsked = false; // the server asked for one the preview did not announce

  @override
  void initState() {
    super.initState();
    _razorpay = CheckoutRazorpay(
      onPaid: _onPaid,
      onError: _onPayError,
      onBusy: (busy) {
        if (mounted) setState(() => _isLoading = busy);
      },
      onChargeNote: (note) {
        if (mounted) setState(() => _chargeNote = note);
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
      _order?.requiresPrescription ??
      (ref.read(cartProvider).view.requiresPrescription || (_summary?.prescriptionRequired ?? false));

  /// Sprint 39: the amount is only held now and charged after the pharmacist's check.
  bool get _chargeAfterCheck => _order?.chargeAfterCheck ?? _summary?.chargeAfterCheck ?? false;

  bool get _isPractitioner => ref.read(authProvider).customerType == 'doc_hospital';

  /// Sprint 44: the preview (or POST /orders) says a signed written order must go with this order.
  bool get _needsWrittenOrder => (_summary?.writtenOrderRequired ?? false) || _writtenAsked;

  /// Sprint 44: a doctor / institution whose registration is not verified or has
  /// lapsed — the server's reason is shown and checkout stops (403 otherwise).
  bool get _registrationBlocked {
    if (!_isPractitioner || _order != null) return false;
    final reg = ref.read(practitionerRegistrationProvider).valueOrNull;
    return reg != null && reg.applies && !reg.canOrder;
  }

  /// [{product_id, quantity}] of the cart, for the written order (requisition).
  List<Map<String, dynamic>> _cartItems() => ref
      .read(cartProvider)
      .view
      .orderableItems
      .map((l) => <String, dynamic>{'product_id': l.productId, 'quantity': l.quantity})
      .toList();

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
  Map<String, dynamic>? _orderBody({bool? declaration, String? prescriptionId, String? writtenOrderId}) {
    Map<String, dynamic>? address;
    for (final a in ref.read(addressesProvider).valueOrNull ?? const <Map<String, dynamic>>[]) {
      if (a['id']?.toString() == _selectedAddressId) address = a;
    }
    if (address == null) {
      _showError('Please select a delivery address');
      return null;
    }
    final cart = ref.read(cartProvider).view;
    // Sprint 38: the server refuses the whole order while paused prescription
    // lines are in the cart (C-08) — say so before asking it; Sprint 39: the
    // same for products not allowed for online sale (C-10)
    if (cart.hasBlockedItems) {
      _showError(cart.checkoutBlockedMessage);
      return null;
    }
    if (cart.orderableItems.isEmpty) {
      _showError('Your cart has no items that can be ordered');
      return null;
    }
    return checkoutOrderBody(cart, address,
        practitionerDeclaration: declaration, prescriptionId: prescriptionId, writtenOrderId: writtenOrderId);
  }

  /// Runs [request] with the button spinner and shows its error, if any.
  /// [handled]: a refusal the step deals with itself (returns true).
  Future<void> _busy(Future<void> Function() request, String fallback, {bool Function(Object e)? handled}) async {
    setState(() => _isLoading = true);
    try {
      await request();
    } catch (e) {
      if (handled != null && handled(e)) return;
      // Sprint 38: paused while checking out — the server's own words, and fresh state
      if (isRxSalesPaused(e)) _refreshRxPause();
      // Sprint 39: a product switched off for online sale meanwhile (C-10) — the cart shows which
      if (isNotForOnlineSale(e)) ref.read(cartProvider.notifier).load();
      _showError(ApiService.errorMessage(e, fallback: fallback));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  // ── Step 1: address → prescription (Rx) or review ─────────────────────────
  void _continueFromAddress() {
    if (_orderBody() == null) return;
    if (_requiresPrescription) {
      _toPrescriptionStep();
    } else {
      _goToReview();
    }
  }

  /// The prescription step, with [error] when the server asked for one (C-08).
  void _toPrescriptionStep({String? error}) {
    setState(() {
      _step = CheckoutStep.prescription;
      if (error != null) _rxError = error;
    });
    _loadPrescriptions(); // uploads made elsewhere since the screen opened
  }

  // ── Step 2: prescription chosen → review ──────────────────────────────────
  void _continueFromPrescription() {
    if (!_rx.hasChoice) {
      _showError('Please choose or upload a prescription');
      return;
    }
    setState(() => _rxError = null);
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
      // Sprint 39: the server says a prescription must go with this order — ask for it first
      if (summary.prescriptionRequired && !_rx.hasChoice) {
        _summary = summary;
        _toPrescriptionStep(error: 'Choose or upload your prescription first.');
        return;
      }
      setState(() {
        _summary = summary;
        _step = CheckoutStep.review;
      });
    }, 'Could not prepare your order summary');
  }

  // ── Step 3: place the order WITH the chosen prescription (Sprint 39, C-08) ──
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
    final needsRx = _requiresPrescription;
    if (needsRx && !_rx.hasChoice) {
      _toPrescriptionStep(error: 'Choose or upload your prescription first.');
      return;
    }
    // Sprint 44 (r.65(9)(b)): the written order comes before the order is placed
    if (_needsWrittenOrder && (_step != CheckoutStep.writtenOrder || _writtenOrderId == null)) {
      setState(() => _step = CheckoutStep.writtenOrder);
      return;
    }
    final body = _orderBody(
      declaration: practitioner ? true : null,
      prescriptionId: needsRx ? _rx.selectedId : null,
      writtenOrderId: _needsWrittenOrder ? _writtenOrderId : null,
    );
    if (body == null) return;
    _orderedRxItems = _cartRxItems();
    await _busy(
        () async {
          final order = PlacedOrder.fromJson(await apiService.placeOrder(body));
          if (!mounted) return;
          ref.read(cartProvider.notifier).load(); // the server removed the ordered lines
          setState(() {
            _order = order;
            _step = CheckoutStep.payment;
            _rxError = null;
          });
        },
        'We could not place your order. Please try again.',
        handled: (e) {
          // Sprint 44: registration not verified / lapsed — fresh status; the server's words in the snackbar
          if (isPractitionerRegistrationInvalid(e)) {
            ref.invalidate(practitionerRegistrationProvider);
            return false;
          }
          // Sprint 44: written order missing, not covering, too old or already used — sign or upload another
          if (isWrittenOrderProblem(e)) {
            ref.invalidate(myWrittenOrdersProvider);
            setState(() {
              _writtenAsked = true;
              _writtenOrderId = null;
              _writtenOrderError =
                  ApiService.errorMessage(e, fallback: 'Sign or upload a written order for this order.');
              _step = CheckoutStep.writtenOrder;
            });
            return true;
          }
          // Nothing was placed: choose or upload another prescription, then place it again
          if (!isPrescriptionProblem(e)) return false;
          _toPrescriptionStep(error: prescriptionProblemText(e, fallback: 'This prescription could not be used.'));
          return true;
        });
  }

  // ── The order is placed but payment was refused for want of a prescription ──
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
  void _onPaid(PaymentResult result) {
    if (!mounted) return;
    ref.read(cartProvider.notifier).load();
    setState(() {
      _paidAuthorised = result.authorised;
      if (result.chargeNote != null && result.chargeNote!.trim().isNotEmpty) _chargeNote = result.chargeNote;
      _step = CheckoutStep.confirmed;
    });
  }

  /// A payment refusal. Sprint 39: 422 PRESCRIPTION_REQUIRED (C-08) — the order
  /// has no prescription with it yet: choose or upload one for it, then pay.
  void _onPayError(String message, [Object? error]) {
    if (!mounted) return;
    if (error != null && isPrescriptionRequired(error) && _order != null) {
      setState(() {
        _step = CheckoutStep.rxFix;
        _rxError = message;
      });
      _loadPrescriptions();
      return;
    }
    if (error != null && isRxSalesPaused(error)) _refreshRxPause();
    _showError(message);
  }

  /// Trial server without Razorpay keys: the demo checkout (no money moves) calls
  /// this from its last screen. A decline is shown by the demo checkout itself.
  Future<bool> _payDemo(DemoChoice choice, bool success) async {
    final orderId = _order?.id;
    if (orderId == null) return false;
    setState(() => _payNotice = null);
    final PaymentResult result;
    try {
      result = await apiService.payOrderDemo(orderId, method: choice.method, provider: choice.provider, fail: !success);
    } catch (e) {
      // Sprint 39: no prescription with the order yet — to the prescription step (C-08)
      if (isPrescriptionRequired(e)) {
        _onPayError(ApiService.errorMessage(e, fallback: 'Please add your prescription first.'), e);
      } else if (isRxSalesPaused(e)) {
        _refreshRxPause(); // the demo checkout shows the server's words
      }
      rethrow;
    }
    if (result.paid && mounted) {
      _paidDemo = true;
      _paidBy = paidByLabel(choice);
      _onPaid(result);
    }
    return result.paid;
  }

  String _payLabel() {
    final o = _payOptions;
    if (o == null) return 'Getting payment options…';
    if (o.isRazorpay) return payButtonLabel(_order?.totalPaise ?? 0, chargeAfterCheck: _chargeAfterCheck);
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
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(msg),
      backgroundColor: Colors.red,
      // long server refusals (e.g. the emergency-stop message) need time to read
      duration: Duration(seconds: msg.length > 90 ? 8 : 4),
    ));
  }

  /// The emergency stop came on: ask the server again for the banner and cart.
  void _refreshRxPause() {
    if (!mounted) return;
    ref.invalidate(salesStatusProvider);
    ref.read(cartProvider.notifier).load();
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

  // Sprint 44: nothing goes on while a doctor's / institution's registration does not allow sales
  VoidCallback? _bottomAction() => _registrationBlocked
      ? null
      : switch (_step) {
          CheckoutStep.address => _continueFromAddress,
          CheckoutStep.prescription => _rx.hasChoice ? _continueFromPrescription : null,
          CheckoutStep.review => _placeOrder,
          CheckoutStep.writtenOrder => _order != null || _writtenOrderId != null ? _placeOrder : null,
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
    final cartRxPaused = ref.watch(cartProvider.select((s) => s.view.rxSalesPaused));
    final isPractitioner = ref.watch(authProvider.select((s) => s.customerType == 'doc_hospital'));
    // Sprint 44: a doctor's / institution's registration decides whether checkout may go on
    if (isPractitioner) ref.watch(practitionerRegistrationProvider);
    final hasRx = _requiresPrescription;
    final written = _needsWrittenOrder;
    final confirmed = _step == CheckoutStep.confirmed;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout'),
        leading: confirmed ? const SizedBox.shrink() : BackButton(onPressed: _onBack),
      ),
      body: Column(
        children: [
          if (!confirmed)
            CheckoutStepBar(
                steps: checkoutBarLabels(hasRx, written: written),
                currentIndex: _step.barIndex(hasRx, written: written)),
          // Sprint 34: lapsed drug licence → retail prices, and why (C-14)
          if (!confirmed) const TradePriceBanner(margin: EdgeInsets.fromLTRB(16, 8, 16, 0)),
          // Sprint 38: emergency stop on prescription medicines (C-08)
          if (!confirmed) RxSalesBanner(serverMessage: cartRxPaused, margin: const EdgeInsets.fromLTRB(16, 8, 16, 0)),
          // Sprint 44: orders paused for a doctor / institution — the server's reason (r.65(9)(b))
          if (isPractitioner &&
              !confirmed &&
              _order == null &&
              _step != CheckoutStep.writtenOrder &&
              _registrationBlocked)
            const Padding(padding: EdgeInsets.fromLTRB(16, 8, 16, 0), child: RegistrationStatusCard(compact: true)),
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
                // Sprint 39: held until the pharmacist's check (C-37)
                chargeNote: _chargeAfterCheck ? chargeNoteOr(_chargeNote) : null,
                paidAuthorised: _paidAuthorised,
                writtenOrderItems: _step == CheckoutStep.writtenOrder ? _cartItems() : const [],
                writtenOrderId: _writtenOrderId,
                writtenOrderError: _writtenOrderError,
                onWrittenOrder: (id) => setState(() {
                  _writtenOrderId = id;
                  if (id != null) _writtenOrderError = null;
                }),
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
                      chargeAfterCheck: _chargeAfterCheck,
                      written: written,
                      writtenChosen: _writtenOrderId != null,
                    ),
              onPressed: _bottomAction(),
              isLoading: _isLoading,
            ),
        ],
      ),
    );
  }
}
