import 'package:flutter/material.dart';

import '../../../models/checkout_summary.dart';
import '../../../services/payment_api.dart';
import '../../../widgets/payments/demo_checkout/demo_checkout.dart';
import '../checkout_flow.dart';
import 'address_step.dart';
import 'confirmed_step.dart';
import 'payment_step.dart';
import 'prescription_step.dart';
import 'review_step.dart';
import 'rx_choice_card.dart';

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
  // Prescription (chosen before the order is placed, Sprint 32)
  final List<Map<String, dynamic>> prescriptions;
  final bool prescriptionsLoading;
  final String? chosenPrescriptionId;
  final ValueChanged<String> onChoosePrescription;
  final VoidCallback onUploadPhoto;
  final VoidCallback onUploadPdf;
  final bool uploading;
  final String? rxError;
  final RxLinkLoader? loadRxLink;
  final VoidCallback? onChangeRx;
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
    required this.prescriptions,
    required this.chosenPrescriptionId,
    required this.onChoosePrescription,
    required this.onUploadPhoto,
    required this.onUploadPdf,
    required this.order,
    this.prescriptionsLoading = false,
    this.uploading = false,
    this.rxError,
    this.loadRxLink,
    this.onChangeRx,
    this.rxItems = const [],
    this.paymentOptions,
    this.onDemoPay,
    this.prescriptionLabel,
    this.paymentNotice,
    this.paidDemo = false,
    this.paidBy,
  });

  Widget _prescriptionStep({String? error}) => PrescriptionStep(
        rxItems: rxItems,
        prescriptions: prescriptions,
        loading: prescriptionsLoading,
        selectedId: chosenPrescriptionId,
        onSelect: onChoosePrescription,
        onPhoto: onUploadPhoto,
        onPdf: onUploadPdf,
        uploading: uploading,
        error: error,
        loadLink: loadRxLink,
      );

  @override
  Widget build(BuildContext context) => switch (step) {
        CheckoutStep.address => AddressStep(
            addresses: addresses,
            selectedId: selectedAddressId,
            onSelect: onSelectAddress,
          ),
        CheckoutStep.prescription => _prescriptionStep(),
        CheckoutStep.review => ReviewStep(
            summary: summary,
            isPractitioner: isPractitioner,
            declared: declared,
            onDeclared: onDeclared,
            orderPlaced: order != null,
            rxLabel: prescriptionLabel,
            onChangeRx: onChangeRx,
          ),
        CheckoutStep.rxFix => _prescriptionStep(error: rxError),
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
            prescriptionLabel: prescriptionLabel,
          ),
      };
}
