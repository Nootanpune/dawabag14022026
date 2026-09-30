import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Text field for the address form. Validation mirrors the server's
/// (it remains the judge and its message is shown on failure).
Widget addressField(
  TextEditingController controller,
  String label, {
  String? hint,
  bool enabled = true,
  int? maxLength,
  TextInputType? keyboard,
  List<TextInputFormatter>? formatters,
  TextCapitalization capitalization = TextCapitalization.words,
  String? Function(String?)? validator,
}) =>
    Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextFormField(
        controller: controller,
        enabled: enabled,
        maxLength: maxLength,
        keyboardType: keyboard,
        inputFormatters: formatters,
        textCapitalization: capitalization,
        decoration: InputDecoration(labelText: label, hintText: hint, counterText: ''),
        validator: validator,
      ),
    );

/// Minimum trimmed length validator.
String? Function(String?) minLength(int n, String message) =>
    (v) => (v?.trim().length ?? 0) < n ? message : null;

final RegExp kAddressMobileRe = RegExp(r'^[6-9]\d{9}$');
final RegExp kAddressPincodeRe = RegExp(r'^\d{6}$');

/// Home / Work / Other chips for the address label.
class AddressLabelPicker extends StatelessWidget {
  static const labels = ['Home', 'Work', 'Other'];
  final String value;
  final bool enabled;
  final ValueChanged<String> onChanged;

  const AddressLabelPicker({super.key, required this.value, required this.onChanged, this.enabled = true});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Wrap(
          spacing: 8,
          children: labels
              .map((l) => ChoiceChip(
                    label: Text(l),
                    selected: value == l,
                    onSelected: enabled ? (_) => onChanged(l) : null,
                  ))
              .toList(),
        ),
      );
}
