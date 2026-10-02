import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../../models/checkout_summary.dart';
import '../../../services/payment_api.dart';
import '../../../widgets/payments/demo_checkout/demo_checkout.dart';
import '../checkout_flow.dart';
import 'address_step.dart';
import 'confirmed_step.dart';
import 'payment_step.dart';
import 'prescription_step.dart';
import 'review_step.dart';

/// The content of the current checkout step. State lives in the screen;
/// this only picks the widget for [step].
class CheckoutStepBody extends StatelessWidget {
  final CheckoutStep step;
  final List<Map<String, dynamic>> addresses;
  final String? selectedAddressId;
  final ValueChanged<String> onSelectAddress;
  final CheckoutSummary? summary;
  final bool isPractitioner;
  final bool declared;
  final ValueChanged<bool> onDeclared;
  final XFile? prescriptionFile;
  final List<dynamic> savedPrescriptions;
  final String? savedPrescriptionId;
  final VoidCallback onPickFile;
  final void Function(String) onSelectSaved;
  final PlacedOrder? order;
  final List<String> rxItems;
  final PaymentOptions? paymentOptions;
  final DemoPay? onDemoPay;
  final String? prescriptionLabel;
  final String? paymentNotice;
  final bool paidDemo;
  /// how the demo payment was made, e.g. "HDFC netbanking (demo)"
  final String? paidBy;

  const CheckoutStepBody({
    super.key,
    required this.step,
    required this.addresses,
    required this.selectedAddressId,
    required this.onSelectAddress,
    required this.summary,
    required this.isPractitioner,
    required this.declared,
    required this.onDeclared,
    required this.prescriptionFile,
    required this.savedPrescriptions,
    required this.savedPrescriptionId,
    required this.onPickFile,
    required this.onSelectSaved,
    required this.order,
    this.rxItems = const [],
    this.paymentOptions,
    this.onDemoPay,
    this.prescriptionLabel,
    this.paymentNotice,
    this.paidDemo = false,
    this.paidBy,
  });

  @override
  Widget build(BuildContext context) => switch (step) {
        CheckoutStep.address => AddressStep(
            addresses: addresses,
            selectedId: selectedAddressId,
            onSelect: onSelectAddress,
          ),
        CheckoutStep.review => ReviewStep(
            summary: summary,
            isPractitioner: isPractitioner,
            declared: declared,
            onDeclared: onDeclared,
            orderPlaced: order != null,
          ),
        CheckoutStep.prescription => PrescriptionStep(
            prescriptionFile: prescriptionFile,
            savedPrescriptions: savedPrescriptions,
            selectedSavedId: savedPrescriptionId,
            onPickFile: onPickFile,
            onSelectSaved: onSelectSaved,
            rxItems: rxItems,
          ),
        CheckoutStep.payment => PaymentStep(
            orderNumber: order?.orderNumber ?? '',
            totalPaise: order?.totalPaise ?? 0,
            options: paymentOptions,
            onDemoPay: onDemoPay,
            prescriptionLabel: prescriptionLabel,
            notice: paymentNotice,
          ),
        CheckoutStep.confirmed => ConfirmedStep(
            orderNumber: order?.orderNumber ?? '',
            shipments: order?.shipments ?? const [],
            demo: paidDemo,
            paidBy: paidBy,
          ),
      };
}
