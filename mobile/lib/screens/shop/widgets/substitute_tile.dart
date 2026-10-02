import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../models/product_page_extras.dart';
import '../../../utils/formatters.dart';
import '../../../widgets/cart_quantity_control.dart';

/// One substitute: maker, pack, price per unit, "Save X%", stock and Add.
/// Nothing is ever swapped automatically.
class SubstituteTile extends StatelessWidget {
  final Substitute s;
  const SubstituteTile({super.key, required this.s});

  @override
  Widget build(BuildContext context) {
    final details = [s.maker, s.pack].whereType<String>().where((x) => x.isNotEmpty).join(' · ');
    return InkWell(
      onTap: () => context.push('/shop/${s.id}'),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(s.name, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
                  if (details.isNotEmpty) Text(details, style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                  const SizedBox(height: 2),
                  Wrap(
                    spacing: 8,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                      Text(formatPrice(s.pricePaise), style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                      Text(perUnitText(s.perUnitPaise, s.unitLabel), style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                      if (s.savePct != null)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                          decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(4)),
                          child: Text('Save ${s.savePct}%',
                              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: Colors.green.shade800)),
                        ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            CartQuantityControl(product: {...s.raw, 'in_stock': s.inStock}, compact: true),
          ],
        ),
      ),
    );
  }
}

/// "Same medicine, different maker. Ask your doctor or pharmacist before switching." + Consult a doctor
class SubstitutesNote extends StatelessWidget {
  final String note;
  const SubstitutesNote({super.key, required this.note});

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: Colors.blue.shade50, borderRadius: BorderRadius.circular(8)),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(note, style: const TextStyle(fontSize: 12)),
            TextButton(
              style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(0, 32)),
              onPressed: () => context.push('/doctors'),
              child: const Text('Consult a doctor'),
            ),
          ],
        ),
      );
}
