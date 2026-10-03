import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../providers/auth_provider.dart';
import '../../../utils/drug_schedule.dart';
import '../../../widgets/rx_sales_banner.dart';

/// Sprint 38: on a prescription medicine's page (Schedule H / H1), the emergency
/// stop banner (C-08). The pause covers buyers who need a prescription — guests
/// and retail customers; licensed trade buyers (retailers, wholesalers, doctors
/// and hospitals) are not covered (backend requiresPrescription).
class ProductRxPauseBanner extends ConsumerWidget {
  final String? schedule;
  const ProductRxPauseBanner({super.key, required this.schedule});

  static const _licensedTypes = {'b2b_retailer', 'b2b_wholesaler', 'doc_hospital'};

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final type = ref.watch(authProvider.select((s) => s.isAuthenticated ? s.customerType : null));
    if (!isRxSchedule(schedule) || _licensedTypes.contains(type)) return const SizedBox.shrink();
    return const RxSalesBanner(margin: EdgeInsets.only(bottom: 12));
  }
}
