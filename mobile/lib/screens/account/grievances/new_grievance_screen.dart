import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/grievance.dart';
import '../../../providers/grievance_provider.dart';
import '../../../services/api_service.dart';

/// /account/complaints/new — raise a complaint (C-36). Limits mirror the
/// server's validation (subject 3–200, description 10–5000); the server
/// remains the judge and its message is shown on failure.
class NewGrievanceScreen extends ConsumerStatefulWidget {
  final String? orderId;
  final String? orderNumber;
  const NewGrievanceScreen({super.key, this.orderId, this.orderNumber});

  @override
  ConsumerState<NewGrievanceScreen> createState() => _NewGrievanceScreenState();
}

class _NewGrievanceScreenState extends ConsumerState<NewGrievanceScreen> {
  final _formKey = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _description = TextEditingController();
  late String _category = widget.orderId != null ? 'order' : 'other';
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _subject.dispose();
    _description.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final created = await ref.read(grievanceProvider.notifier).create(
            category: _category,
            subject: _subject.text.trim(),
            description: _description.text.trim(),
            orderId: widget.orderId,
          );
      if (!mounted) return;
      final ticket = created['ticket_no']?.toString();
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(ticket != null ? 'Complaint $ticket registered' : 'Complaint registered'),
      ));
      final id = created['id']?.toString();
      if (id != null && id.isNotEmpty) {
        context.pushReplacement('/account/complaints/$id');
      } else {
        context.pop();
      }
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = ApiService.errorMessage(e, fallback: 'Could not register your complaint');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('New complaint')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (widget.orderId != null) ...[
              Card(
                child: ListTile(
                  leading: const Icon(Icons.receipt_long, color: AppTheme.brandGreen),
                  title: Text('Order ${widget.orderNumber ?? ''}'.trim()),
                  subtitle: const Text('This complaint will be linked to the order'),
                  dense: true,
                ),
              ),
              const SizedBox(height: 12),
            ],
            DropdownButtonFormField<String>(
              value: _category,
              decoration: const InputDecoration(labelText: 'What is it about?'),
              items: kGrievanceCategories.entries
                  .map((e) => DropdownMenuItem(value: e.key, child: Text(e.value)))
                  .toList(),
              onChanged: _submitting ? null : (v) => setState(() => _category = v ?? _category),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _subject,
              enabled: !_submitting,
              maxLength: 200,
              decoration: const InputDecoration(labelText: 'Subject'),
              validator: (v) {
                final t = v?.trim() ?? '';
                if (t.length < 3) return 'Enter at least 3 characters';
                return null;
              },
            ),
            const SizedBox(height: 4),
            TextFormField(
              controller: _description,
              enabled: !_submitting,
              maxLength: 5000,
              minLines: 5,
              maxLines: 10,
              decoration: const InputDecoration(
                labelText: 'Describe the problem',
                alignLabelWithHint: true,
              ),
              validator: (v) {
                final t = v?.trim() ?? '';
                if (t.length < 10) return 'Enter at least 10 characters';
                return null;
              },
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Submit complaint'),
            ),
            const SizedBox(height: 12),
            Text(
              'You can also reach our Grievance Officer — see Account → About & legal.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }
}
