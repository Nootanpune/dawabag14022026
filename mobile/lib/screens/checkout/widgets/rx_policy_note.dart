import 'package:flutter/material.dart';

/// What happens to a prescription order — the existing process, not a new
/// policy: the pharmacist checks it before dispatch (C-08); if it is not
/// accepted the buyer is told why and can send a new one, or cancel for a full
/// refund to the way they paid (cancellation.service, C-37).
class RxPolicyNote extends StatelessWidget {
  const RxPolicyNote({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: const Color(0xFFE6F1FB), borderRadius: BorderRadius.circular(10)),
      child: const Text(
        'Our pharmacist checks your prescription before anything is dispatched. If it cannot be accepted, '
        'we tell you why. You can then send a new prescription, or cancel the order and get a full refund '
        'to the way you paid.',
        style: TextStyle(fontSize: 12, color: Color(0xFF0C447C)),
      ),
    );
  }
}

/// "Prescription (photo) uploaded 02 Oct 2026, 9:56 am ✓ — our pharmacist checks it before dispatch."
class RxAttachedNote extends StatelessWidget {
  final String label;
  /// Review step, before the order is placed: go back and choose another one
  final VoidCallback? onChange;
  const RxAttachedNote({super.key, required this.label, this.onChange});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.green.shade50,
        border: Border.all(color: Colors.green.shade200),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(Icons.check_circle, color: Colors.green.shade700, size: 20),
        const SizedBox(width: 8),
        Expanded(
          child: Text('Prescription ($label) ✓ — our pharmacist checks it before dispatch.',
              style: TextStyle(fontSize: 13, color: Colors.green.shade900, fontWeight: FontWeight.w600)),
        ),
        if (onChange != null)
          TextButton(
            onPressed: onChange,
            style: TextButton.styleFrom(minimumSize: const Size(48, 32), padding: const EdgeInsets.symmetric(horizontal: 8)),
            child: const Text('Change'),
          ),
      ]),
    );
  }
}
