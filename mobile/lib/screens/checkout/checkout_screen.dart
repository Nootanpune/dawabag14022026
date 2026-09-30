import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:dio/dio.dart';

import '../../providers/cart_provider.dart';
import '../../services/api_service.dart';
import '../../config/theme.dart';
import '../../utils/formatters.dart';

enum CheckoutStep { address, prescription, payment, confirmed }

class CheckoutScreen extends ConsumerStatefulWidget {
  const CheckoutScreen({super.key});

  @override
  ConsumerState<CheckoutScreen> createState() => _CheckoutScreenState();
}

class _CheckoutScreenState extends ConsumerState<CheckoutScreen> {
  CheckoutStep _step = CheckoutStep.address;
  List<dynamic> _addresses = [];
  String? _selectedAddressId;
  String? _orderId;
  String? _orderNumber;
  XFile? _prescriptionFile;
  String? _savedPrescriptionId;
  List<dynamic> _savedPrescriptions = [];
  bool _isLoading = false;
  late Razorpay _razorpay;

  static const int _shippingPaise = 4900;

  @override
  void initState() {
    super.initState();
    _razorpay = Razorpay();
    _razorpay.on(Razorpay.EVENT_PAYMENT_SUCCESS, _onPaymentSuccess);
    _razorpay.on(Razorpay.EVENT_PAYMENT_ERROR, _onPaymentError);
    _loadAddresses();
    _loadPrescriptions();
  }

  @override
  void dispose() {
    _razorpay.clear();
    super.dispose();
  }

  Future<void> _loadAddresses() async {
    try {
      final res = await apiService.dio.get('/users/me/addresses');
      setState(() {
        _addresses = res.data['data'] as List;
        if (_addresses.isNotEmpty) _selectedAddressId = _addresses[0]['id'];
      });
    } catch (_) {}
  }

  Future<void> _loadPrescriptions() async {
    try {
      final res = await apiService.dio.get('/prescriptions/my');
      setState(() {
        _savedPrescriptions = (res.data['data'] as List)
            .where((p) => p['status'] == 'verified')
            .toList();
      });
    } catch (_) {}
  }

  // ── Step 1: Create order ────────────────────────────────────────────────────
  Future<void> _createOrder() async {
    if (_selectedAddressId == null) {
      _showError('Please select a delivery address');
      return;
    }
    setState(() => _isLoading = true);
    try {
      final cart = ref.read(cartProvider);
      final pincode = await _getPincode();
      final res = await apiService.dio.post('/orders', data: {
        'address_id': _selectedAddressId,
        'items': cart.items.map((i) => {'product_id': i.productId, 'quantity': i.quantity}).toList(),
        if (cart.couponCode != null) 'coupon_code': cart.couponCode,
        'pincode': pincode,
      });
      final data = res.data['data'];
      setState(() {
        _orderId = data['id'];
        _orderNumber = data['order_number'];
        _step = cart.requiresPrescription ? CheckoutStep.prescription : CheckoutStep.payment;
      });
    } catch (e) {
      _showError((e as dynamic).response?.data?['error'] ?? 'Failed to create order');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  // ── Step 2: Upload prescription ─────────────────────────────────────────────
  Future<void> _pickPrescription() async {
    final picker = ImagePicker();
    final source = await _showPickerSheet();
    if (source == null) return;
    final file = source == ImageSource.camera
        ? await picker.pickImage(source: ImageSource.camera, imageQuality: 85)
        : await picker.pickImage(source: ImageSource.gallery, imageQuality: 85);
    if (file != null) setState(() { _prescriptionFile = file; _savedPrescriptionId = null; });
  }

  Future<ImageSource?> _showPickerSheet() => showModalBottomSheet<ImageSource>(
    context: context,
    builder: (_) => Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        const SizedBox(height: 8),
        ListTile(leading: const Icon(Icons.camera_alt), title: const Text('Take photo'),
          onTap: () => Navigator.pop(context, ImageSource.camera)),
        ListTile(leading: const Icon(Icons.photo_library), title: const Text('Choose from gallery'),
          onTap: () => Navigator.pop(context, ImageSource.gallery)),
        const SizedBox(height: 8),
      ],
    ),
  );

  Future<void> _uploadPrescription() async {
    if (_prescriptionFile == null && _savedPrescriptionId == null) {
      _showError('Please upload a prescription or select a saved one');
      return;
    }
    if (_prescriptionFile != null && _orderId != null) {
      setState(() => _isLoading = true);
      try {
        final formData = FormData.fromMap({
          'prescription': await MultipartFile.fromFile(
            _prescriptionFile!.path,
            filename: _prescriptionFile!.name,
          ),
          'order_id': _orderId!,
        });
        await apiService.dio.post('/prescriptions/upload', data: formData);
      } catch (e) {
        _showError((e as dynamic).response?.data?['error'] ?? 'Upload failed');
        setState(() => _isLoading = false);
        return;
      } finally {
        setState(() => _isLoading = false);
      }
    }
    setState(() => _step = CheckoutStep.payment);
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
      _showError((e as dynamic).response?.data?['error'] ?? 'Payment error');
    } finally {
      setState(() => _isLoading = false);
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
      ref.read(cartProvider.notifier).clear();
      if (mounted) setState(() => _step = CheckoutStep.confirmed);
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

  Future<String> _getPincode() async {
    // Read from shared_preferences
    return '';
  }

  @override
  Widget build(BuildContext context) {
    final cart = ref.watch(cartProvider);
    final total = cart.subtotal + _shippingPaise - cart.couponDiscountPaise;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Checkout'),
        leading: _step == CheckoutStep.confirmed
            ? const SizedBox.shrink()
            : BackButton(onPressed: () {
                if (_step == CheckoutStep.prescription) {
                  setState(() => _step = CheckoutStep.address);
                } else if (_step == CheckoutStep.payment) {
                  setState(() => _step = cart.requiresPrescription
                      ? CheckoutStep.prescription : CheckoutStep.address);
                } else {
                  context.pop();
                }
              }),
      ),
      body: Column(
        children: [
          // Step indicator
          if (_step != CheckoutStep.confirmed) _buildStepBar(cart.requiresPrescription),

          Expanded(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(16),
              child: switch (_step) {
                CheckoutStep.address       => _AddressStep(addresses: _addresses, selectedId: _selectedAddressId,
                    onSelect: (id) => setState(() => _selectedAddressId = id)),
                CheckoutStep.prescription  => _PrescriptionStep(
                    prescriptionFile: _prescriptionFile,
                    savedPrescriptions: _savedPrescriptions,
                    selectedSavedId: _savedPrescriptionId,
                    onPickFile: _pickPrescription,
                    onSelectSaved: (id) => setState(() { _savedPrescriptionId = id; _prescriptionFile = null; }),
                  ),
                CheckoutStep.payment       => _PaymentStep(subtotal: cart.subtotal,
                    shipping: _shippingPaise, discount: cart.couponDiscountPaise, total: total),
                CheckoutStep.confirmed     => _ConfirmedStep(orderNumber: _orderNumber ?? ''),
              },
            ),
          ),

          // Bottom CTA
          if (_step != CheckoutStep.confirmed)
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                child: ElevatedButton(
                  onPressed: _isLoading ? null : () => switch (_step) {
                    CheckoutStep.address      => _createOrder(),
                    CheckoutStep.prescription => _uploadPrescription(),
                    CheckoutStep.payment      => _initiatePayment(),
                    _                        => null,
                  },
                  child: _isLoading
                      ? const SizedBox(width: 20, height: 20,
                          child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                      : Text(switch (_step) {
                          CheckoutStep.address      => 'Continue',
                          CheckoutStep.prescription => 'Continue to payment',
                          CheckoutStep.payment      => 'Pay ${formatPrice(total)} securely',
                          _                        => '',
                        }),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildStepBar(bool hasPrescription) {
    final steps = hasPrescription
        ? ['Address', 'Prescription', 'Payment']
        : ['Address', 'Payment'];
    final currentIdx = switch (_step) {
      CheckoutStep.address      => 0,
      CheckoutStep.prescription => 1,
      CheckoutStep.payment      => hasPrescription ? 2 : 1,
      _                        => -1,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
      color: Colors.white,
      child: Row(
        children: List.generate(steps.length * 2 - 1, (i) {
          if (i.isOdd) {
            final done = currentIdx > i ~/ 2;
            return Expanded(child: Container(height: 1.5, color: done ? AppTheme.brandGreen : Colors.grey.shade200));
          }
          final si = i ~/ 2;
          final done = currentIdx > si;
          final active = currentIdx == si;
          return Row(
            children: [
              Container(
                width: 24, height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: done ? AppTheme.brandGreen : active ? AppTheme.brandGreen : Colors.grey.shade200,
                  border: active ? Border.all(color: AppTheme.brandGreen, width: 2) : null,
                ),
                child: Center(
                  child: done
                      ? const Icon(Icons.check, size: 12, color: Colors.white)
                      : Text('${si + 1}', style: TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w700,
                          color: active ? Colors.white : Colors.grey.shade500)),
                ),
              ),
              const SizedBox(width: 6),
              Text(steps[si], style: TextStyle(
                fontSize: 12, fontWeight: active ? FontWeight.w700 : FontWeight.normal,
                color: active ? AppTheme.brandGreen600 : done ? AppTheme.brandGreen : Colors.grey,
              )),
            ],
          );
        }),
      ),
    );
  }
}

// ── Address step ───────────────────────────────────────────────────────────────
class _AddressStep extends StatelessWidget {
  final List addresses;
  final String? selectedId;
  final void Function(String) onSelect;

  const _AddressStep({required this.addresses, required this.selectedId, required this.onSelect});

  @override
  Widget build(BuildContext context) {
    if (addresses.isEmpty) {
      return Center(
        child: Column(
          children: [
            const SizedBox(height: 40),
            const Icon(Icons.location_off, size: 48, color: Colors.grey),
            const SizedBox(height: 12),
            const Text('No saved addresses', style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            OutlinedButton(onPressed: () => context.push('/account'), child: const Text('Add address')),
          ],
        ),
      );
    }
    return Column(
      children: addresses.map<Widget>((addr) {
        final selected = selectedId == addr['id'];
        return GestureDetector(
          onTap: () => onSelect(addr['id']),
          child: Container(
            margin: const EdgeInsets.only(bottom: 10),
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              border: Border.all(
                color: selected ? AppTheme.brandGreen : Colors.grey.shade200,
                width: selected ? 2 : 1,
              ),
              borderRadius: BorderRadius.circular(12),
              color: selected ? AppTheme.brandGreen50 : Colors.white,
            ),
            child: Row(
              children: [
                Container(
                  width: 20, height: 20,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: selected ? AppTheme.brandGreen : Colors.grey.shade400, width: 2),
                    color: selected ? AppTheme.brandGreen : Colors.transparent,
                  ),
                  child: selected ? const Icon(Icons.check, size: 12, color: Colors.white) : null,
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${addr['label']} — ${addr['full_name']}',
                        style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                      const SizedBox(height: 3),
                      Text(
                        '${addr['address_line1']}${addr['address_line2'] != null ? ', ${addr['address_line2']}' : ''}, '
                        '${addr['city']} — ${addr['pincode']}',
                        style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Prescription step ──────────────────────────────────────────────────────────
class _PrescriptionStep extends StatelessWidget {
  final XFile? prescriptionFile;
  final List savedPrescriptions;
  final String? selectedSavedId;
  final VoidCallback onPickFile;
  final void Function(String) onSelectSaved;

  const _PrescriptionStep({
    required this.prescriptionFile, required this.savedPrescriptions,
    required this.selectedSavedId, required this.onPickFile, required this.onSelectSaved,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('Upload prescription',
          style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text('Required for Schedule H medicines in your cart.',
          style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
        const SizedBox(height: 20),

        // Upload zone
        GestureDetector(
          onTap: onPickFile,
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 32),
            decoration: BoxDecoration(
              border: Border.all(
                color: prescriptionFile != null ? AppTheme.brandGreen : Colors.grey.shade300,
                width: 1.5,
                style: BorderStyle.solid,
              ),
              borderRadius: BorderRadius.circular(12),
              color: prescriptionFile != null ? AppTheme.brandGreen50 : Colors.grey.shade50,
            ),
            child: Column(
              children: [
                Icon(
                  prescriptionFile != null ? Icons.check_circle : Icons.upload_file,
                  size: 44,
                  color: prescriptionFile != null ? AppTheme.brandGreen : Colors.grey.shade400,
                ),
                const SizedBox(height: 10),
                Text(
                  prescriptionFile != null ? prescriptionFile!.name : 'Tap to upload or take photo',
                  style: TextStyle(
                    fontWeight: FontWeight.w600, fontSize: 14,
                    color: prescriptionFile != null ? AppTheme.brandGreen700 : Colors.grey.shade600,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 4),
                Text('JPEG, PNG or PDF · Max 10 MB',
                  style: TextStyle(fontSize: 12, color: Colors.grey.shade400)),
              ],
            ),
          ),
        ),

        if (savedPrescriptions.isNotEmpty) ...[
          const SizedBox(height: 20),
          const Text('Or use a saved prescription',
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
          const SizedBox(height: 10),
          ...savedPrescriptions.map((rx) => GestureDetector(
            onTap: () => onSelectSaved(rx['id']),
            child: Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                border: Border.all(
                  color: selectedSavedId == rx['id'] ? AppTheme.brandGreen : Colors.grey.shade200,
                  width: selectedSavedId == rx['id'] ? 2 : 1,
                ),
                borderRadius: BorderRadius.circular(10),
                color: selectedSavedId == rx['id'] ? AppTheme.brandGreen50 : Colors.white,
              ),
              child: Row(
                children: [
                  const Icon(Icons.description, color: AppTheme.brandGreen, size: 20),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(rx['doctor_name'] != null ? 'Dr. ${rx['doctor_name']}' : 'Uploaded prescription',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13,
                            color: AppTheme.brandGreen700)),
                        Text('Valid until ${rx['valid_until'] ?? '—'}',
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          )),
        ],

        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: const Color(0xFFFAEEDA),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              const Text('📞', style: TextStyle(fontSize: 16)),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Our pharmacist will call you to verify the prescription before dispatching your order.',
                  style: TextStyle(fontSize: 12, color: Colors.brown.shade700),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ── Payment step ───────────────────────────────────────────────────────────────
class _PaymentStep extends StatelessWidget {
  final int subtotal, shipping, discount, total;
  const _PaymentStep({required this.subtotal, required this.shipping, required this.discount, required this.total});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                _Row('Subtotal', formatPrice(subtotal)),
                const SizedBox(height: 10),
                _Row('Shipping', formatPrice(shipping)),
                if (discount > 0) ...[
                  const SizedBox(height: 10),
                  _Row('Discount', '–${formatPrice(discount)}', valueColor: Colors.green),
                ],
                const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Divider()),
                _Row('Total payable', formatPrice(total), bold: true, valueColor: AppTheme.brandGreen600),
                const SizedBox(height: 6),
                Text('Incl. all taxes (GST)',
                  style: TextStyle(fontSize: 11, color: Colors.grey.shade400)),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: const Color(0xFFE6F1FB),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(
            children: [
              const Icon(Icons.lock, color: Color(0xFF185FA5), size: 18),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  'Secure payment via Razorpay — UPI, credit/debit cards, net banking & wallets. No cash on delivery.',
                  style: const TextStyle(fontSize: 12, color: Color(0xFF0C447C)),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _Row(String label, String value, {bool bold = false, Color? valueColor}) =>
    Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: TextStyle(fontSize: bold ? 15 : 13, fontWeight: bold ? FontWeight.w700 : FontWeight.normal, color: bold ? null : Colors.grey.shade600)),
        Text(value, style: TextStyle(fontSize: bold ? 16 : 13, fontWeight: bold ? FontWeight.w700 : FontWeight.normal, color: valueColor)),
      ],
    );
}

// ── Confirmed step ─────────────────────────────────────────────────────────────
class _ConfirmedStep extends StatelessWidget {
  final String orderNumber;
  const _ConfirmedStep({required this.orderNumber});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const SizedBox(height: 40),
        Container(
          width: 72, height: 72,
          decoration: BoxDecoration(color: Colors.green.shade50, shape: BoxShape.circle),
          child: const Icon(Icons.check_circle, color: Colors.green, size: 40),
        ),
        const SizedBox(height: 20),
        const Text('Order confirmed!',
          style: TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        const SizedBox(height: 8),
        Text('Order ID: $orderNumber',
          style: TextStyle(fontSize: 14, color: Colors.grey.shade500)),
        const SizedBox(height: 8),
        Text('You\'ll receive SMS and email updates at every step.',
          style: TextStyle(fontSize: 13, color: Colors.grey.shade400), textAlign: TextAlign.center),
        const SizedBox(height: 32),
        ElevatedButton(
          onPressed: () => context.go('/orders'),
          child: const Text('Track my order'),
        ),
        const SizedBox(height: 12),
        OutlinedButton(
          onPressed: () => context.go('/'),
          child: const Text('Continue shopping'),
        ),
      ],
    );
  }
}
