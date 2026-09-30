import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../checkout_flow.dart';
import 'address_step.dart';
import 'confirmed_step.dart';
import 'payment_step.dart';
import 'prescription_step.dart';

/// The content of the current checkout step. State lives in the screen;
/// this only picks the widget for [step].
class CheckoutStepBody extends StatelessWidget {
  final CheckoutStep step;
  final List<Map<String, dynamic>> addresses;
  final String? selectedAddressId;
  final ValueChanged<String> onSelectAddress;
  final XFile? prescriptionFile;
  final List<dynamic> savedPrescriptions;
  final String? savedPrescriptionId;
  final VoidCallback onPickFile;
  final void Function(String) onSelectSaved;
  final PlacedOrder? order;

  const CheckoutStepBody({
    super.key,
    required this.step,
    required this.addresses,
    required this.selectedAddressId,
    required this.onSelectAddress,
    required this.prescriptionFile,
    required this.savedPrescriptions,
    required this.savedPrescriptionId,
    required this.onPickFile,
    required this.onSelectSaved,
    required this.order,
  });

  @override
  Widget build(BuildContext context) => switch (step) {
        CheckoutStep.address => AddressStep(
            addresses: addresses,
            selectedId: selectedAddressId,
            onSelect: onSelectAddress,
          ),
        CheckoutStep.prescription => PrescriptionStep(
            prescriptionFile: prescriptionFile,
            savedPrescriptions: savedPrescriptions,
            selectedSavedId: savedPrescriptionId,
            onPickFile: onPickFile,
            onSelectSaved: onSelectSaved,
          ),
        CheckoutStep.payment => PaymentStep(
            orderNumber: order?.orderNumber ?? '',
            totalPaise: order?.totalPaise ?? 0,
          ),
        CheckoutStep.confirmed => ConfirmedStep(
            orderNumber: order?.orderNumber ?? '',
            shipments: order?.shipments ?? const [],
          ),
      };
}
