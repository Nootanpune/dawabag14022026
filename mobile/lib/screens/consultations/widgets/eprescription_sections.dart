import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/consultation.dart';
import '../../../models/eprescription.dart';
import '../../../utils/consult_format.dart';
import '../../../utils/ist.dart';

/// The parts of an e-prescription in the Telemedicine Practice Guidelines
/// 2020 format: doctor and registration, patient, consultation, diagnosis,
/// medicines, advice, validity and the code any pharmacy can check (C-23, C-24).

class RxSectionCard extends StatelessWidget {
  final String title;
  final Widget child;
  const RxSectionCard({super.key, required this.title, required this.child});

  @override
  Widget build(BuildContext context) => Card(
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title.toUpperCase(),
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: Colors.grey.shade500,
                      letterSpacing: 0.8)),
              const SizedBox(height: 8),
              child,
            ],
          ),
        ),
      );
}

class _Line extends StatelessWidget {
  final String label;
  final String? value;
  const _Line(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    final v = value;
    if (v == null || v.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
          ),
          Expanded(child: Text(v, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}

/// Prescriber: name, qualification, registration number and council.
class RxDoctorSection extends StatelessWidget {
  final EPrescription rx;
  const RxDoctorSection({super.key, required this.rx});

  @override
  Widget build(BuildContext context) => RxSectionCard(
        title: 'Prescribed by',
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(rx.doctorName ?? '',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            _Line('Qualification', rx.doctorQualification),
            _Line('Registration no.', rx.doctorRegNo),
            _Line('Council', rx.doctorCouncil),
          ],
        ),
      );
}

/// Patient and consultation details.
class RxPatientSection extends StatelessWidget {
  final EPrescription rx;
  const RxPatientSection({super.key, required this.rx});

  @override
  Widget build(BuildContext context) {
    final ageGender = [
      if (rx.patientAge != null) '${rx.patientAge} years',
      if (rx.patientGender != null && rx.patientGender!.isNotEmpty) _gender(rx.patientGender!),
    ].join(', ');
    final consult = [
      if (rx.consultMode != null) consultModeLabel(rx.consultMode!),
      if (rx.consultKind != null) consultKindLabel(rx.consultKind),
    ].join(' · ');
    return RxSectionCard(
      title: 'Patient',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Line('Name', rx.patientName),
          _Line('Age / gender', ageGender),
          _Line('Consultation', consult),
          _Line('Issued', rx.issuedAt == null ? null : formatDateTimeIst(rx.issuedAt!)),
        ],
      ),
    );
  }

  static String _gender(String g) => switch (g.toLowerCase()) {
        'male' || 'm' => 'Male',
        'female' || 'f' => 'Female',
        'other' || 'o' => 'Other',
        _ => g,
      };
}

/// Diagnosis / provisional diagnosis.
class RxDiagnosisSection extends StatelessWidget {
  final String diagnosis;
  const RxDiagnosisSection({super.key, required this.diagnosis});

  @override
  Widget build(BuildContext context) => RxSectionCard(
        title: 'Diagnosis',
        child: Text(diagnosis, style: const TextStyle(fontSize: 14)),
      );
}

/// Rx: one block per medicine with dosage, frequency, duration, instructions.
class RxMedicinesSection extends StatelessWidget {
  final List<EPrescriptionItem> items;
  const RxMedicinesSection({super.key, required this.items});

  @override
  Widget build(BuildContext context) => RxSectionCard(
        title: 'Rx — medicines',
        child: items.isEmpty
            ? Text('No medicines prescribed.', style: TextStyle(fontSize: 13, color: Colors.grey.shade600))
            : Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  for (var i = 0; i < items.length; i++) ...[
                    if (i > 0) const Divider(height: 16),
                    _MedicineRow(index: i + 1, item: items[i]),
                  ],
                ],
              ),
      );
}

class _MedicineRow extends StatelessWidget {
  final int index;
  final EPrescriptionItem item;
  const _MedicineRow({required this.index, required this.item});

  @override
  Widget build(BuildContext context) {
    final detail = [
      if (item.dosage != null && item.dosage!.isNotEmpty) item.dosage!,
      if (item.frequency != null && item.frequency!.isNotEmpty) item.frequency!,
      if (item.durationDays != null) '${item.durationDays} day${item.durationDays == 1 ? '' : 's'}',
    ].join(' · ');
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 24,
          child: Text('$index.', style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
        ),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.medicineName, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
              if (detail.isNotEmpty)
                Text(detail, style: TextStyle(fontSize: 13, color: Colors.grey.shade800)),
              if (item.instructions != null && item.instructions!.trim().isNotEmpty)
                Text(item.instructions!.trim(),
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade600, fontStyle: FontStyle.italic)),
            ],
          ),
        ),
      ],
    );
  }
}

/// Advice to the patient.
class RxAdviceSection extends StatelessWidget {
  final String advice;
  const RxAdviceSection({super.key, required this.advice});

  @override
  Widget build(BuildContext context) => RxSectionCard(
        title: 'Advice',
        child: Text(advice, style: const TextStyle(fontSize: 14)),
      );
}

/// Validity and the check code a pharmacy uses to verify it (C-24).
class RxValiditySection extends StatelessWidget {
  final EPrescription rx;
  const RxValiditySection({super.key, required this.rx});

  @override
  Widget build(BuildContext context) {
    final validDay = consultDay(rx.validUntil);
    final expired = validDay != null && validDay.isBefore(todayIstDate());
    return RxSectionCard(
      title: 'Validity and check code',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (rx.validUntil != null)
            Text(
              expired
                  ? 'Expired on ${formatConsultDay(rx.validUntil)}'
                  : 'Valid until ${formatConsultDay(rx.validUntil)}',
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: expired ? Colors.red.shade700 : AppTheme.brandGreen700,
              ),
            ),
          if (rx.verificationCode != null && rx.verificationCode!.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                color: AppTheme.brandGreen50,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Column(
                children: [
                  Text('Check code', style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const SizedBox(height: 4),
                  SelectableText(
                    rx.verificationCode!,
                    style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 3,
                      color: AppTheme.brandGreen700,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Any pharmacy can check this prescription with this code at dawabag.in/eprescriptions/verify.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
        ],
      ),
    );
  }
}
