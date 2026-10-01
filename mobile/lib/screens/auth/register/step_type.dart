import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import 'register_constants.dart';
import 'register_controller.dart';
import 'register_widgets.dart';

/// Step 1 — choose the account type (4 cards).
class StepType extends StatelessWidget {
  final RegisterController c;
  const StepType({super.key, required this.c});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        const Text('How will you use Dawabag?',
            style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
        const SizedBox(height: 4),
        Text('Pricing and verification depend on your account type.',
            style: TextStyle(color: Colors.grey.shade600, fontSize: 14)),
        const SizedBox(height: 20),
        for (final option in kCustomerTypes) ...[
          _typeCard(option),
          const SizedBox(height: 12),
        ],
        const SizedBox(height: 12),
        RegisterPrimaryButton(
          'Continue',
          c.customerType == null ? null : () => c.goTo(RegisterStep.details),
        ),
        const SizedBox(height: 16),
        Center(
          child: GestureDetector(
            onTap: () => context.go('/auth/login'),
            child: RichText(
              text: TextSpan(
                style: TextStyle(color: Colors.grey.shade600, fontSize: 14),
                children: const [
                  TextSpan(text: 'Already have an account? '),
                  TextSpan(
                      text: 'Sign in',
                      style: TextStyle(
                          color: AppTheme.brandGreen, fontWeight: FontWeight.w600)),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _typeCard(CustomerTypeOption option) {
    final selected = c.customerType == option.value;
    return Material(
      color: selected ? AppTheme.brandGreen50 : Colors.white,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () => c.selectType(option.value),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? AppTheme.brandGreen : Colors.grey.shade300,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: selected ? AppTheme.brandGreen : AppTheme.brandGreen50,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(option.icon,
                    color: selected ? Colors.white : AppTheme.brandGreen, size: 22),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(option.label,
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 4),
                    Text(option.description,
                        style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: option.value == 'customer'
                            ? AppTheme.brandGreen100
                            : AppTheme.amberBadge,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(option.kycNote,
                          style: TextStyle(
                            fontSize: 11.5,
                            fontWeight: FontWeight.w600,
                            color: option.value == 'customer'
                                ? AppTheme.brandGreen700
                                : AppTheme.amberText,
                          )),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_off,
                color: selected ? AppTheme.brandGreen : Colors.grey.shade400,
                size: 22,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
