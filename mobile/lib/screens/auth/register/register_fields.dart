import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../utils/password_policy.dart';
import '../../../widgets/brand/labeled_field.dart';
import '../../../models/practitioner.dart' show kPractitionerKinds;
import 'register_constants.dart';
import 'register_controller.dart';

/// Text field used across the details step; its label is shown above it
/// (Sprint 35 brand restyle, design review: labels above fields).
Widget registerTextField(
  TextEditingController ctrl,
  String label, {
  String? hint,
  String? prefix,
  TextInputType? keyboard,
  bool obscure = false,
  bool caps = false,
  bool words = false,
  int? maxLength,
  List<TextInputFormatter>? formatters,
  String? Function(String?)? validator,
  ValueChanged<String>? onChanged,
}) =>
    LabeledField(
        label: label,
        child: TextFormField(
          controller: ctrl,
          keyboardType: keyboard,
          obscureText: obscure,
          maxLength: maxLength,
          textCapitalization: caps
              ? TextCapitalization.characters
              : words
                  ? TextCapitalization.words
                  : TextCapitalization.none,
          inputFormatters: formatters,
          decoration: InputDecoration(
            hintText: hint,
            prefixText: prefix,
            counterText: maxLength != null ? '' : null,
          ),
          validator: validator,
          onChanged: onChanged,
        ));

/// The server's password rules, in its own words (utils/password_policy.dart
/// mirrors backend utils/passwordPolicy.ts); the server checks again.
Widget registerPasswordField(RegisterController c) => LabeledField(
      label: 'Password',
      child: TextFormField(
        controller: c.passwordCtrl,
        obscureText: !c.showPassword,
        decoration: InputDecoration(
          helperText: kPasswordRules,
          helperMaxLines: 2,
          suffixIcon: IconButton(
            tooltip: c.showPassword ? 'Hide password' : 'Show password',
            icon: Icon(c.showPassword ? Icons.visibility_off : Icons.visibility, size: 20),
            onPressed: () => c.update(() => c.showPassword = !c.showPassword),
          ),
        ),
        validator: (v) => passwordProblem(v ?? '', mobile: c.mobileCtrl.text.trim()),
      ),
    );

Widget registerPanField(RegisterController c) => registerTextField(
      c.panCtrl,
      'PAN',
      hint: 'ABCDE1234F',
      caps: true,
      maxLength: 10,
      formatters: [
        FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
        UpperCaseFormatter(),
      ],
      validator: (v) {
        final t = (v ?? '').trim().toUpperCase();
        if (t.isEmpty) return 'PAN is required';
        if (!kPanRe.hasMatch(t)) return 'Enter a valid PAN (e.g. ABCDE1234F)';
        return null;
      },
    );

Widget registerGstinField(RegisterController c, {required bool isRequired}) => registerTextField(
      c.gstinCtrl,
      isRequired ? 'GSTIN' : 'GSTIN (optional)',
      hint: '27ABCDE1234F1Z5',
      caps: true,
      maxLength: 15,
      formatters: [
        FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9]')),
        UpperCaseFormatter(),
      ],
      // Rebuild so the GST declaration checkbox shows/hides for retailers.
      onChanged: (_) => c.update(),
      validator: (v) {
        final t = (v ?? '').trim().toUpperCase();
        if (t.isEmpty) return isRequired ? 'GSTIN is required' : null;
        if (!kGstinRe.hasMatch(t)) return 'Enter a valid 15-character GSTIN';
        return null;
      },
    );

Widget registerDlTypeField(RegisterController c, Map<String, String> options) => LabeledField(
    label: 'Drug licence type',
    child: DropdownButtonFormField<String>(
      key: ValueKey('dl_type_${c.customerType}'),
      initialValue: options.containsKey(c.dlType) ? c.dlType : null,
      isExpanded: true,
      decoration: const InputDecoration(),
      items: options.entries.map((e) => DropdownMenuItem<String>(value: e.key, child: Text(e.value))).toList(),
      onChanged: (v) => c.update(() => c.dlType = v),
      validator: (v) => v == null ? 'Select the drug licence type' : null,
    ));

/// Sprint 44: registering as a doctor or a medical institution (backend `practitioner_kind`).
Widget registerPractitionerKindField(RegisterController c) => LabeledField(
    label: 'Registering as',
    child: DropdownButtonFormField<String>(
      key: const ValueKey('register-practitioner-kind'),
      initialValue: c.practitionerKind,
      isExpanded: true,
      decoration: const InputDecoration(),
      items: kPractitionerKinds.entries
          .map((e) => DropdownMenuItem<String>(value: e.key, child: Text(e.value)))
          .toList(),
      onChanged: (v) => c.update(() => c.practitionerKind = v ?? 'doctor'),
    ));

Widget registerSpecialityField(RegisterController c) => LabeledField(
    label: 'Speciality',
    child: DropdownButtonFormField<String>(
      initialValue: c.speciality,
      isExpanded: true,
      decoration: const InputDecoration(),
      items: kSpecialities.map((s) => DropdownMenuItem<String>(value: s, child: Text(s))).toList(),
      onChanged: (v) => c.update(() => c.speciality = v),
      validator: (v) => v == null ? 'Select your speciality' : null,
    ));
