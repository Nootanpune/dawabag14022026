import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import 'register_constants.dart';

/// Inline server / validation error shown above a step's primary button.
class RegisterErrorBanner extends StatelessWidget {
  final String? error;
  const RegisterErrorBanner({super.key, required this.error});

  @override
  Widget build(BuildContext context) {
    final message = error;
    if (message == null) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 16),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFDECEC),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFF5C2C2)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.error_outline, color: AppTheme.errorRed, size: 20),
          const SizedBox(width: 8),
          Expanded(
            child: Text(message,
                style: const TextStyle(color: AppTheme.errorRed, fontSize: 13.5)),
          ),
        ],
      ),
    );
  }
}

class RegisterPrimaryButton extends StatelessWidget {
  final String label;
  final VoidCallback? onPressed;
  final bool loading;

  const RegisterPrimaryButton(this.label, this.onPressed, {super.key, this.loading = false});

  @override
  Widget build(BuildContext context) => ElevatedButton(
        onPressed: loading ? null : onPressed,
        child: loading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
            : Text(label),
      );
}

class RegisterSectionTitle extends StatelessWidget {
  final String text;
  const RegisterSectionTitle(this.text, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(top: 8, bottom: 12),
        child: Text(text, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
      );
}

/// Checkbox inside a Form. When [requiredMessage] is given the box must be
/// ticked for the form to validate (the message is shown inline).
class CheckboxFormField extends StatelessWidget {
  final bool value;
  final ValueChanged<bool> onChanged;
  final Widget title;
  final String? requiredMessage;

  const CheckboxFormField({
    super.key,
    required this.value,
    required this.onChanged,
    required this.title,
    this.requiredMessage,
  });

  @override
  Widget build(BuildContext context) => FormField<bool>(
        initialValue: value,
        validator: (_) => (requiredMessage != null && !value) ? requiredMessage : null,
        builder: (field) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CheckboxListTile(
              value: value,
              onChanged: (v) {
                onChanged(v ?? false);
                field.didChange(v ?? false);
              },
              title: title,
              controlAffinity: ListTileControlAffinity.leading,
              contentPadding: EdgeInsets.zero,
              dense: true,
              activeColor: AppTheme.brandGreen,
            ),
            if (field.hasError)
              Padding(
                padding: const EdgeInsets.only(left: 12),
                child: Text(field.errorText ?? '',
                    style:
                        TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 12)),
              ),
          ],
        ),
      );
}

/// Numbered step dots (Type · Details · Documents · Verify).
class RegisterStepIndicator extends StatelessWidget {
  final List<RegisterStep> steps;
  final RegisterStep current;

  const RegisterStepIndicator({super.key, required this.steps, required this.current});

  @override
  Widget build(BuildContext context) {
    final currentIndex = steps.indexOf(current);
    return Padding(
      padding: const EdgeInsets.fromLTRB(24, 12, 24, 4),
      child: Row(
        children: [
          for (var i = 0; i < steps.length; i++) ...[
            if (i > 0)
              Expanded(
                child: Container(
                  height: 2,
                  margin: const EdgeInsets.only(bottom: 18),
                  color: i <= currentIndex ? AppTheme.brandGreen : Colors.grey.shade300,
                ),
              ),
            _dot(i + 1, kStepLabels[steps[i]] ?? '',
                done: i < currentIndex, active: i == currentIndex),
          ],
        ],
      ),
    );
  }

  Widget _dot(int number, String label, {required bool done, required bool active}) {
    final highlighted = done || active;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 26,
          height: 26,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: highlighted ? AppTheme.brandGreen : Colors.white,
            border: Border.all(color: highlighted ? AppTheme.brandGreen : Colors.grey.shade400),
          ),
          child: Center(
            child: done
                ? const Icon(Icons.check, size: 15, color: Colors.white)
                : Text('$number',
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: active ? Colors.white : Colors.grey.shade600,
                    )),
          ),
        ),
        const SizedBox(height: 4),
        Text(label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: active ? FontWeight.w700 : FontWeight.w500,
              color: highlighted ? AppTheme.brandGreen : Colors.grey.shade600,
            )),
      ],
    );
  }
}
