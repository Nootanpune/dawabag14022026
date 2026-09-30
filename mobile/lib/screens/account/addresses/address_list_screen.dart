import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/address.dart';
import '../../../providers/address_provider.dart';
import '../../../services/address_api.dart';
import '../../../services/api_service.dart';
import '../../../widgets/error_retry_view.dart';
import 'address_tile.dart';

/// /account/addresses — saved delivery addresses from GET /users/me/addresses.
/// Every change is a request followed by a reload; nothing is kept locally.
class AddressListScreen extends ConsumerStatefulWidget {
  const AddressListScreen({super.key});

  @override
  ConsumerState<AddressListScreen> createState() => _AddressListScreenState();
}

class _AddressListScreenState extends ConsumerState<AddressListScreen> {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    // Always show the server's current list when the screen opens.
    Future.microtask(() => ref.invalidate(addressesProvider));
  }

  Future<void> _run(Future<void> Function() action, String done, String failed) async {
    // Held before the await so the list (also used by checkout) is reloaded
    // even if this screen closes meanwhile.
    final container = ProviderScope.containerOf(context, listen: false);
    setState(() => _busy = true);
    String? error;
    try {
      await action();
    } catch (e) {
      error = ApiService.errorMessage(e, fallback: failed);
    }
    container.invalidate(addressesProvider);
    if (!mounted) return;
    setState(() => _busy = false);
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(error ?? done), backgroundColor: error != null ? Colors.red : null),
    );
  }

  Future<void> _delete(Address a) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Delete this address?'),
        content: Text(a.oneLine),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Delete', style: TextStyle(color: Colors.red)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    await _run(() => apiService.deleteAddress(a.id), 'Address deleted', 'Could not delete this address');
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(addressesProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('Saved addresses')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: _busy ? null : () => context.push('/account/addresses/new'),
        backgroundColor: AppTheme.brandGreen,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_location_alt_outlined),
        label: const Text('Add address'),
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator(color: AppTheme.brandGreen)),
        error: (e, _) => ErrorRetryView(
          message: ApiService.errorMessage(e, fallback: 'Could not load your addresses'),
          onRetry: () => ref.invalidate(addressesProvider),
        ),
        data: (raw) {
          final addresses = raw.map(Address.fromJson).toList();
          return RefreshIndicator(
            color: AppTheme.brandGreen,
            onRefresh: () => ref.refresh(addressesProvider.future),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
              children: [
                if (_busy) const LinearProgressIndicator(color: AppTheme.brandGreen),
                if (addresses.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 48),
                    child: Center(
                      child: Text('No saved addresses yet', style: TextStyle(color: Colors.grey.shade500)),
                    ),
                  ),
                ...addresses.map((a) => AddressTile(
                      address: a,
                      busy: _busy,
                      onEdit: () => context.push('/account/addresses/${a.id}/edit'),
                      onDelete: () => _delete(a),
                      onMakeDefault: () => _run(() => apiService.setDefaultAddress(a.id),
                          'Default address updated', 'Could not update the default address'),
                    )),
              ],
            ),
          );
        },
      ),
    );
  }
}
