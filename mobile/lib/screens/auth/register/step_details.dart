import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'consent_checkboxes.dart';
import 'register_constants.dart';
import 'register_controller.dart';
import 'register_fields.dart';
import 'register_widgets.dart';

/// Step 2 — type-specific details, login details and consents.
/// Customers register from here; other types continue to documents.
class StepDetails extends StatelessWidget {
  final RegisterController c;
  final void Function(String message, bool isError) onMessage;

  const StepDetails({super.key, required this.c, required this.onMessage});

  @override
  Widget build(BuildContext context) {
    final option = kCustomerTypes.firstWhere(
      (o) => o.value == c.customerType,
      orElse: () => kCustomerTypes.first,
    );
    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Form(
        key: c.formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(option.label,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),

            if (c.isB2B) ...[
              const RegisterSectionTitle('Business details'),
              registerTextField(c.businessCtrl, c.isRetailer ? 'Pharmacy / hospital name' : 'Firm name',
                  validator: (v) => (v == null || v.trim().length < 2)
                      ? 'Business name is required'
                      : null),
              const SizedBox(height: 14),
              registerDlTypeField(c, c.isRetailer ? kRetailerDlTypes : kWholesalerDlTypes),
              const SizedBox(height: 14),
              registerTextField(c.dlNumberCtrl, 'Drug licence number',
                  caps: true,
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Drug licence number is required'
                      : null),
              const SizedBox(height: 14),
              registerGstinField(c, isRequired: c.isWholesaler),
              const SizedBox(height: 14),
              registerPanField(c),
              if (c.isRetailer && c.gstinCtrl.text.trim().isEmpty) ...[
                const SizedBox(height: 8),
                _gstDeclaration('I confirm this business is not registered under GST.'),
              ],
              const SizedBox(height: 20),
            ],

            if (c.isDoctor) ...[
              const RegisterSectionTitle('Registration details'),
              registerTextField(c.nmcRegCtrl, 'NMC / State Medical Council reg. number',
                  caps: true,
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Registration number is required'
                      : null),
              const SizedBox(height: 14),
              registerTextField(c.nmcCouncilCtrl, 'Medical council',
                  hint: 'e.g. Maharashtra Medical Council',
                  validator: (v) => (v == null || v.trim().isEmpty)
                      ? 'Medical council is required'
                      : null),
              const SizedBox(height: 14),
              registerSpecialityField(c),
              const SizedBox(height: 14),
              registerPanField(c),
              const SizedBox(height: 8),
              _gstDeclaration('I confirm I am not registered under GST.'),
              // Unticked by default; the server requires it for doctors (C-15)
              CheckboxFormField(
                value: c.practitionerDeclared,
                onChanged: (v) => c.update(() => c.practitionerDeclared = v),
                requiredMessage: 'Please confirm to continue',
                title: const Text(
                  'I will buy medicines only to treat or dispense to my own patients, not for '
                  'resale, and never Schedule X or narcotic (NDPS) drugs.',
                  style: TextStyle(fontSize: 14),
                ),
              ),
              const SizedBox(height: 20),
            ],

            RegisterSectionTitle(c.isCustomer ? 'Your details' : 'Contact & login'),
            registerTextField(
              c.nameCtrl,
              c.isDoctor
                  ? 'Full name (as registered, incl. "Dr.")'
                  : c.isB2B
                      ? 'Contact person name'
                      : 'Full name',
              hint: c.isDoctor ? 'Dr. Asha Patil' : 'Rajesh Shah',
              words: true,
              validator: (v) {
                final t = v?.trim() ?? '';
                if (t.length < 2) return 'Name is too short';
                if (t.length > 255) return 'Name is too long';
                return null;
              },
            ),
            const SizedBox(height: 14),
            registerTextField(
              c.mobileCtrl,
              'Mobile number',
              hint: '9876543210',
              prefix: '+91  ',
              keyboard: TextInputType.phone,
              maxLength: 10,
              formatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) {
                if (v == null || v.isEmpty) return 'Mobile number required';
                if (!kMobileRe.hasMatch(v.trim())) return 'Enter valid 10-digit number';
                return null;
              },
            ),
            const SizedBox(height: 14),
            registerTextField(
              c.emailCtrl,
              c.isB2B ? 'Email (invoices are sent here)' : 'Email (optional)',
              hint: 'name@example.com',
              keyboard: TextInputType.emailAddress,
              validator: (v) {
                final t = v?.trim() ?? '';
                if (t.isEmpty) return c.isB2B ? 'Email is required' : null;
                if (!kEmailRe.hasMatch(t)) return 'Enter a valid email';
                return null;
              },
            ),
            const SizedBox(height: 14),
            registerTextField(
              c.pincodeCtrl,
              c.isCustomer ? 'Pincode (optional)' : 'Pincode',
              hint: '411001',
              keyboard: TextInputType.number,
              maxLength: 6,
              formatters: [FilteringTextInputFormatter.digitsOnly],
              validator: (v) {
                final t = v?.trim() ?? '';
                if (t.isEmpty) return c.isCustomer ? null : 'Pincode is required';
                if (!kPincodeRe.hasMatch(t)) return 'Enter a valid 6-digit pincode';
                return null;
              },
            ),
            const SizedBox(height: 14),
            registerPasswordField(c),
            const SizedBox(height: 14),
            registerTextField(c.confirmCtrl, 'Confirm password',
                obscure: !c.showPassword,
                validator: (v) =>
                    v != c.passwordCtrl.text ? 'Passwords do not match' : null),
            const SizedBox(height: 14),
            registerTextField(c.referralCtrl, 'Referral code (optional)', hint: 'e.g. RAJA20', caps: true),
            const SizedBox(height: 20),

            ConsentCheckboxes(c: c, onMessage: onMessage),
            const SizedBox(height: 20),

            RegisterErrorBanner(error: c.error),
            RegisterPrimaryButton(
              c.isCustomer ? 'Create account' : 'Continue',
              () {
                FocusScope.of(context).unfocus();
                c.submitDetails();
              },
              loading: c.isSubmitting,
            ),
          ],
        ),
      ),
    );
  }

  Widget _gstDeclaration(String text) => CheckboxFormField(
        value: c.gstDeclared,
        onChanged: (v) => c.update(() => c.gstDeclared = v),
        requiredMessage: 'Please confirm to continue',
        title: Text(text, style: const TextStyle(fontSize: 14)),
      );
}
