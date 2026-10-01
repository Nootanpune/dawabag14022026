import 'package:flutter/material.dart';

/// Small bold heading between home-screen sections.
class SectionHeader extends StatelessWidget {
  final String title;
  const SectionHeader(this.title, {super.key});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 10),
        child: Text(title, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
      );
}
