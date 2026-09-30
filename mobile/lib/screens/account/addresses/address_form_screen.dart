import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/address.dart';
import '../../../providers/address_provider.dart';
import '../../../services/address_api.dart';
import '../../../services/api_service.dart';
import 'address_form_fields.dart';

/// /account/addresses/new and /account/addresses/:id/edit. Saves to the
/// server (POST / PUT /users/me/addresses) and reloads the shared list, so
/// checkout sees the change at once. Nothing is stored on the device.
class AddressFormScreen extends ConsumerStatefulWidget {
  /// Null to add a new address.
  final String? addressId;
  const AddressFormScreen({super.key, this.addressId});

  @override
  ConsumerState<AddressFormScreen> createState() => _AddressFormScreenState();
}

class _AddressFormScreenState extends ConsumerState<AddressFormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _mobile = TextEditingController();
  final _line1 = TextEditingController();
  final _line2 = TextEditingController();
  final _city = TextEditingController();
  final _state = TextEditingController();
  final _pincode = TextEditingController();
  String _label = 'Home';
  bool _isDefault = false;
  bool _filled = false;
  bool _saving = false;
  String? _error;

  bool get _isEdit => widget.addressId != null;

  @override
  void dispose() {
    for (final c in [_name, _mobile, _line1, _line2, _city, _state, _pincode]) {
      c.dispose();
    }
    super.dispose();
  }

  /// Fills the form once from the server's copy of the address being edited.
  void _fill(Address a) {
    _filled = true;
    _label = a.label;
    _name.text = a.fullName;
    _mobile.text = a.mobile;
    _line1.text = a.addressLine1;
    _line2.text = a.addressLine2 ?? '';
    _city.text = a.city;
    _state.text = a.state;
    _pincode.text = a.pincode;
    _isDefault = a.isDefault;
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    final container = ProviderScope.containerOf(context, listen: false);
    final input = AddressInput(
      label: _label,
      fullName: _name.text.trim(),
      mobile: _mobile.text.trim(),
      addressLine1: _line1.text.trim(),
      addressLine2: _line2.text.trim(),
      city: _city.text.trim(),
      state: _state.text.trim(),
      pincode: _pincode.text.trim(),
      isDefault: _isDefault,
    );
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final id = widget.addressId;
      if (id != null) {
        await apiService.updateAddress(id, input);
      } else {
        await apiService.createAddress(input);
      }
      container.invalidate(addressesProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(_isEdit ? 'Address updated' : 'Address saved')),
      );
      context.pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = ApiService.errorMessage(e, fallback: 'Could not save this address');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isEdit && !_filled) {
      final list = ref.watch(addressesProvider).valueOrNull;
      final match = list?.where((m) => m['id']?.toString() == widget.addressId).toList();
      if (match != null && match.isNotEmpty) {
        _fill(Address.fromJson(match.first));
      } else {
        return Scaffold(
          appBar: AppBar(title: const Text('Edit address')),
          body: Center(
            child: list == null
                ? const CircularProgressIndicator(color: AppTheme.brandGreen)
                : const Text('This address is no longer saved.'),
          ),
        );
      }
    }
    final on = !_saving;
    return Scaffold(
      appBar: AppBar(title: Text(_isEdit ? 'Edit address' : 'Add address')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            AddressLabelPicker(value: _label, enabled: on, onChanged: (l) => setState(() => _label = l)),
            addressField(_name, 'Full name', enabled: on, maxLength: 255,
                validator: minLength(2, 'Enter the name of the person receiving the order')),
            addressField(_mobile, 'Mobile number', hint: '9876543210', enabled: on, maxLength: 10,
                keyboard: TextInputType.phone,
                formatters: [FilteringTextInputFormatter.digitsOnly],
                validator: (v) => kAddressMobileRe.hasMatch(v?.trim() ?? '')
                    ? null
                    : 'Enter a 10-digit mobile number starting with 6–9'),
            addressField(_line1, 'House / flat, building, street', enabled: on, maxLength: 500,
                validator: minLength(5, 'Enter at least 5 characters')),
            addressField(_line2, 'Area, landmark (optional)', enabled: on, maxLength: 500),
            addressField(_pincode, 'Pincode', hint: '411001', enabled: on, maxLength: 6,
                keyboard: TextInputType.number,
                formatters: [FilteringTextInputFormatter.digitsOnly],
                validator: (v) =>
                    kAddressPincodeRe.hasMatch(v?.trim() ?? '') ? null : 'Enter a 6-digit pincode'),
            addressField(_city, 'City', enabled: on, maxLength: 100,
                validator: minLength(2, 'Enter the city')),
            addressField(_state, 'State', enabled: on, maxLength: 100,
                validator: minLength(2, 'Enter the state')),
            SwitchListTile(
              value: _isDefault,
              onChanged: on ? (v) => setState(() => _isDefault = v) : null,
              title: const Text('Use as my default address', style: TextStyle(fontSize: 14)),
              contentPadding: EdgeInsets.zero,
              activeColor: AppTheme.brandGreen,
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: on ? _save : null,
              child: _saving
                  ? const SizedBox(
                      width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : Text(_isEdit ? 'Save changes' : 'Save address'),
            ),
          ],
        ),
      ),
    );
  }
}
