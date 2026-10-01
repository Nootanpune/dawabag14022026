import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/doctor.dart';
import '../../../utils/formatters.dart';

/// Qualification and council registration, shown wherever a doctor is
/// offered to a patient (Telemedicine Practice Guidelines 2020; C-22).
class DoctorRegistrationText extends StatelessWidget {
  final String qualification;
  final String registrationLine;
  const DoctorRegistrationText({
    super.key,
    required this.qualification,
    required this.registrationLine,
  });

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (qualification.isNotEmpty)
            Text(qualification, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
          const SizedBox(height: 2),
          Row(
            children: [
              const Icon(Icons.verified_outlined, size: 14, color: AppTheme.brandGreen),
              const SizedBox(width: 4),
              Expanded(
                child: Text(registrationLine,
                    style: TextStyle(fontSize: 12, color: Colors.grey.shade700)),
              ),
            ],
          ),
        ],
      );
}

/// Initials avatar for a doctor (no photos are served).
class DoctorAvatar extends StatelessWidget {
  final String name;
  final double size;
  const DoctorAvatar({super.key, required this.name, this.size = 48});

  @override
  Widget build(BuildContext context) {
    final initials = name
        .replaceFirst(RegExp(r'^Dr\.?\s*', caseSensitive: false), '')
        .split(' ')
        .where((s) => s.isNotEmpty)
        .take(2)
        .map((s) => s[0].toUpperCase())
        .join();
    return Container(
      width: size,
      height: size,
      decoration: const BoxDecoration(color: AppTheme.brandGreen50, shape: BoxShape.circle),
      child: Center(
        child: Text(initials.isEmpty ? 'Dr' : initials,
            style: TextStyle(
                fontSize: size * 0.36, fontWeight: FontWeight.w700, color: AppTheme.brandGreen600)),
      ),
    );
  }
}

/// One doctor in the directory.
class DoctorCard extends StatelessWidget {
  final Doctor doctor;
  final VoidCallback onTap;
  const DoctorCard({super.key, required this.doctor, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final d = doctor;
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              DoctorAvatar(name: d.fullName),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(d.fullName,
                        style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                    if (d.speciality != null && d.speciality!.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(d.speciality!,
                          style: const TextStyle(fontSize: 12, color: AppTheme.brandGreen700)),
                    ],
                    const SizedBox(height: 4),
                    DoctorRegistrationText(
                      qualification: d.qualification,
                      registrationLine: d.registrationLine,
                    ),
                    if (d.languages.isNotEmpty) ...[
                      const SizedBox(height: 4),
                      Text('Speaks ${d.languages.join(', ')}',
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                    ],
                    const SizedBox(height: 6),
                    Text(d.feePaise > 0 ? 'Fee ${formatPrice(d.feePaise)}' : 'No consultation fee',
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: Colors.grey.shade400),
            ],
          ),
        ),
      ),
    );
  }
}
