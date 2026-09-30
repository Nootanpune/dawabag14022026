import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../providers/auth_provider.dart';
import '../../config/theme.dart';
import '../../utils/formatters.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);

    if (!auth.isAuthenticated) {
      return Scaffold(
        appBar: AppBar(title: const Text('Account')),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.person_outline, size: 56, color: Colors.grey),
              const SizedBox(height: 16),
              const Text('Sign in to your account',
                style: TextStyle(fontWeight: FontWeight.w600, fontSize: 17)),
              const SizedBox(height: 24),
              SizedBox(
                width: 200,
                child: ElevatedButton(
                  onPressed: () => context.push('/auth/login'),
                  child: const Text('Sign in'),
                ),
              ),
              const SizedBox(height: 12),
              SizedBox(
                width: 200,
                child: OutlinedButton(
                  onPressed: () => context.push('/auth/register'),
                  child: const Text('Create account'),
                ),
              ),
              const SizedBox(height: 12),
              // Statutory disclosures are public (C-04)
              TextButton(
                onPressed: () => context.push('/legal'),
                child: const Text('About & legal'),
              ),
            ],
          ),
        ),
      );
    }

    final user = auth.user ?? {};
    final walletBalance = user['wallet_balance_paise'] ?? 0;
    final initials = ((user['full_name'] as String?) ?? 'U')
        .split(' ')
        .take(2)
        .map((s) => s.isEmpty ? '' : s[0].toUpperCase())
        .join();

    return Scaffold(
      appBar: AppBar(title: const Text('Account')),
      body: ListView(
        children: [
          // Profile header
          Container(
            padding: const EdgeInsets.all(20),
            color: Colors.white,
            child: Row(
              children: [
                Container(
                  width: 56, height: 56,
                  decoration: const BoxDecoration(color: AppTheme.brandGreen50, shape: BoxShape.circle),
                  child: Center(
                    child: Text(initials,
                      style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: AppTheme.brandGreen600)),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user['full_name'] ?? 'User',
                        style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700)),
                      const SizedBox(height: 2),
                      Text('+91 ${user['mobile'] ?? ''}',
                        style: TextStyle(fontSize: 13, color: Colors.grey.shade500)),
                    ],
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // Wallet card
          Container(
            margin: const EdgeInsets.symmetric(horizontal: 16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppTheme.brandGreen,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(
              children: [
                const Icon(Icons.account_balance_wallet, color: Colors.white, size: 28),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Wallet balance',
                        style: TextStyle(color: Colors.white70, fontSize: 12)),
                      Text(formatPrice(walletBalance),
                        style: const TextStyle(color: Colors.white, fontSize: 22, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
                if (user['referral_code'] != null)
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      const Text('Referral code',
                        style: TextStyle(color: Colors.white70, fontSize: 11)),
                      Text(user['referral_code'],
                        style: const TextStyle(color: Colors.white, fontSize: 15, fontWeight: FontWeight.w700, letterSpacing: 1.5)),
                    ],
                  ),
              ],
            ),
          ),

          const SizedBox(height: 16),

          // Menu sections
          _Section('Orders', [
            _MenuItem(icon: Icons.receipt_long, label: 'My orders', onTap: () => context.go('/orders')),
            _MenuItem(icon: Icons.replay, label: 'Refill subscriptions', onTap: () => context.push('/account/refills')),
            // C-37 returns and refunds; C-29 side-effect reports
            _MenuItem(icon: Icons.assignment_return_outlined, label: 'Returns & refunds', onTap: () => context.push('/account/returns')),
            _MenuItem(icon: Icons.healing_outlined, label: 'Side-effect reports', onTap: () => context.push('/account/side-effects')),
            _MenuItem(icon: Icons.description, label: 'My prescriptions', onTap: () {}),
          ]),

          _Section('Patients & Addresses', [
            _MenuItem(icon: Icons.people, label: 'Patient profiles', onTap: () {}),
            _MenuItem(icon: Icons.location_on_outlined, label: 'Saved addresses', onTap: () => context.push('/account/addresses')),
          ]),

          _Section('Offers & Referrals', [
            _MenuItem(icon: Icons.local_offer_outlined, label: 'My coupons & offers', onTap: () {}),
            _MenuItem(icon: Icons.share, label: 'Refer & earn', onTap: () {}),
          ]),

          _Section('Consultation', [
            _MenuItem(icon: Icons.video_call_outlined, label: 'Consult a doctor', onTap: () => context.push('/doctors')),
            _MenuItem(icon: Icons.history, label: 'My consultations', onTap: () {}),
          ]),

          _Section('Help & privacy', [
            // C-36 complaints, C-40..C-44 consents/data rights, C-04 disclosures
            _MenuItem(icon: Icons.support_agent, label: 'Complaints', onTap: () => context.push('/account/complaints')),
            _MenuItem(icon: Icons.privacy_tip_outlined, label: 'Privacy', onTap: () => context.push('/account/privacy')),
            _MenuItem(icon: Icons.gavel_outlined, label: 'About & legal', onTap: () => context.push('/legal')),
          ]),

          _Section('Account', [
            _MenuItem(icon: Icons.person_outline, label: 'Edit profile', onTap: () {}),
            _MenuItem(icon: Icons.notifications_outlined, label: 'Notification settings', onTap: () {}),
            _MenuItem(
              icon: Icons.logout,
              label: 'Sign out',
              color: Colors.red,
              onTap: () async {
                final confirm = await showDialog<bool>(
                  context: context,
                  builder: (_) => AlertDialog(
                    title: const Text('Sign out'),
                    content: const Text('Are you sure you want to sign out?'),
                    actions: [
                      TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
                      TextButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Sign out', style: TextStyle(color: Colors.red)),
                      ),
                    ],
                  ),
                );
                if (confirm == true) {
                  await ref.read(authProvider.notifier).logout();
                  if (context.mounted) context.go('/');
                }
              },
            ),
          ]),

          const SizedBox(height: 32),
          Center(child: Text('Dawabag v1.0.0', style: TextStyle(fontSize: 12, color: Colors.grey.shade400))),
          const SizedBox(height: 16),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> items;
  const _Section(this.title, this.items);

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
        child: Text(title.toUpperCase(),
          style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: Colors.grey.shade500, letterSpacing: 0.8)),
      ),
      Container(
        color: Colors.white,
        child: Column(children: items),
      ),
    ],
  );
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color? color;
  const _MenuItem({required this.icon, required this.label, required this.onTap, this.color});

  @override
  Widget build(BuildContext context) => ListTile(
    leading: Icon(icon, color: color ?? Colors.grey.shade600, size: 22),
    title: Text(label, style: TextStyle(fontSize: 14, color: color)),
    trailing: color != null ? null : Icon(Icons.chevron_right, color: Colors.grey.shade400, size: 20),
    onTap: onTap,
    contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 2),
    dense: true,
  );
}
