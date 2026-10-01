import 'package:flutter/material.dart';

import '../../../utils/formatters.dart';
import 'info_row.dart';

/// Product details and the pre-packed goods declarations (Legal Metrology,
/// C-17: MRP, net quantity, manufacturer, country of origin, expiry of the
/// batch supplied) exactly as the server sends them. Rows the server has no
/// value for are hidden rather than shown as "—".
class ProductDeclarations extends StatelessWidget {
  final Map<String, dynamic> product;
  const ProductDeclarations({super.key, required this.product});

  @override
  Widget build(BuildContext context) {
    final p = product;
    final mrp = p['mrp_paise'];
    final batchExpiry = p['supplied_batch_expiry']?.toString();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        InfoSection(title: 'Product details', rows: [
          InfoRow('Generic name', p['generic_name']),
          InfoRow('Composition', p['composition']),
          InfoRow('Category', p['category']),
          InfoRow('Schedule', p['drug_schedule']),
          InfoRow('SKU', p['sku']),
        ]),
        InfoSection(title: 'Product declarations', rows: [
          InfoRow('MRP (incl. all taxes)', mrp == null ? null : formatPrice(mrp)),
          InfoRow('Net quantity', p['net_quantity']),
          InfoRow('Manufacturer', p['manufacturer_name']),
          InfoRow('Manufacturer address', p['manufacturer_address']),
          InfoRow('Marketed by', p['marketed_by']),
          InfoRow('Country of origin', p['country_of_origin']),
          // Year-month of the earliest-expiring batch that will be supplied (C-27)
          InfoRow('Expiry of supplied batch',
              batchExpiry == null || batchExpiry.isEmpty ? null : '$batchExpiry or later'),
          InfoRow('Storage', p['storage_instructions']),
        ]),
      ],
    );
  }
}
