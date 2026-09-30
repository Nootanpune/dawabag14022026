import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'register_constants.dart';
import 'register_controller.dart';

/// Text field used across the details step.
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
    TextFormField(
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
        labelText: label,
        hintText: hint,
        prefixText: prefix,
        counterText: maxLength != null ? '' : null,
      ),
      validator: validator,
      onChanged: onChanged,
    );

Widget registerPasswordField(RegisterController c) => TextFormField(
      controller: c.passwordCtrl,
      obscureText: !c.showPassword,
      decoration: InputDecoration(
        labelText: 'Password',
        helperText: 'Minimum 8 characters',
        suffixIcon: IconButton(
          icon: Icon(c.showPassword ? Icons.visibility_off : Icons.visibility, size: 20),
          onPressed: () => c.update(() => c.showPassword = !c.showPassword),
        ),
      ),
      validator: (v) => (v == null || v.length < 8) ? 'Minimum 8 characters' : null,
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

Widget registerGstinField(RegisterController c, {required bool isRequired}) =>
    registerTextField(
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

Widget registerDlTypeField(RegisterController c, Map<String, String> options) =>
    DropdownButtonFormField<String>(
      key: ValueKey('dl_type_${c.customerType}'),
      value: options.containsKey(c.dlType) ? c.dlType : null,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Drug licence type'),
      items: options.entries
          .map((e) => DropdownMenuItem<String>(value: e.key, child: Text(e.value)))
          .toList(),
      onChanged: (v) => c.update(() => c.dlType = v),
      validator: (v) => v == null ? 'Select the drug licence type' : null,
    );

Widget registerSpecialityField(RegisterController c) => DropdownButtonFormField<String>(
      value: c.speciality,
      isExpanded: true,
      decoration: const InputDecoration(labelText: 'Speciality'),
      items: kSpecialities
          .map((s) => DropdownMenuItem<String>(value: s, child: Text(s)))
          .toList(),
      onChanged: (v) => c.update(() => c.speciality = v),
      validator: (v) => v == null ? 'Select your speciality' : null,
    );
