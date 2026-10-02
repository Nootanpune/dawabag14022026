import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../config/theme.dart';
import '../../../models/adverse_event.dart';
import '../../../models/json_utils.dart';
import '../../../providers/adverse_event_provider.dart';
import '../../../services/api_service.dart';
import '../../../services/compliance_api.dart';
import 'side_effect_fields.dart';

/// /account/side-effects/new?productId=..&productName=..&orderId=.. —
/// report a suspected side effect (C-29). Only initials and age are asked,
/// not the patient's name (data minimisation, C-40). Sent to the server only.
class NewSideEffectScreen extends ConsumerStatefulWidget {
  final String productId;
  final String? productName;
  final String? orderId;
  const NewSideEffectScreen({super.key, required this.productId, this.productName, this.orderId});

  @override
  ConsumerState<NewSideEffectScreen> createState() => _NewSideEffectScreenState();
}

class _NewSideEffectScreenState extends ConsumerState<NewSideEffectScreen> {
  final _formKey = GlobalKey<FormState>();
  final _initials = TextEditingController();
  final _age = TextEditingController();
  final _batch = TextEditingController();
  final _reaction = TextEditingController();
  String? _gender;
  String? _seriousness;
  String? _outcome;
  DateTime? _onset;
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_initials, _age, _batch, _reaction]) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, dynamic> _body() {
    final age = int.tryParse(_age.text.trim());
    final batch = _batch.text.trim();
    final onset = OnsetDateField.toApi(_onset);
    return {
      'product_id': widget.productId,
      if (widget.orderId != null && widget.orderId!.isNotEmpty) 'order_id': widget.orderId,
      if (batch.isNotEmpty) 'batch_number': batch,
      'patient_initials': _initials.text.trim().toUpperCase(),
      if (age != null) 'patient_age_years': age,
      if (_gender != null) 'patient_gender': _gender,
      'reaction': _reaction.text.trim(),
      if (onset != null) 'onset_date': onset,
      'seriousness': _seriousness,
      if (_outcome != null) 'outcome': _outcome,
    };
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _submitting = true;
      _error = null;
    });
    try {
      final created = await apiService.createAdverseEvent(_body());
      if (!mounted) return;
      ref.invalidate(adverseEventsProvider);
      final no = asString(created['report_no']);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(no != null ? 'Report $no sent to our pharmacist' : 'Report sent to our pharmacist'),
      ));
      context.pushReplacement('/account/side-effects');
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = ApiService.errorMessage(e, fallback: 'Could not send your report');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final busy = _submitting;
    return Scaffold(
      appBar: AppBar(title: const Text('Report a side effect')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.red.shade50, borderRadius: BorderRadius.circular(10)),
              child: const Text(
                'If the reaction is severe (trouble breathing, swelling of the face or throat, '
                'fainting), stop the medicine and get medical help now.',
                style: TextStyle(fontSize: 12, color: Colors.red),
              ),
            ),
            const SizedBox(height: 12),
            Card(
              child: ListTile(
                leading: const Icon(Icons.medication_outlined, color: AppTheme.brandTeal),
                title: Text(widget.productName ?? 'Medicine from your order'),
                dense: true,
              ),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _reaction,
              enabled: !busy,
              maxLength: 5000,
              minLines: 4,
              maxLines: 8,
              decoration: const InputDecoration(
                labelText: 'What happened?',
                hintText: 'Describe the reaction, e.g. itchy rash on arms after the second dose',
                alignLabelWithHint: true,
              ),
              validator: (v) => (v?.trim().length ?? 0) < 10 ? 'Enter at least 10 characters' : null,
            ),
            CodeDropdown(
              label: 'How serious was it?',
              options: kAdrSeriousness,
              value: _seriousness,
              enabled: !busy,
              requiredMessage: 'Please choose how serious it was',
              onChanged: (v) => setState(() => _seriousness = v),
            ),
            const SizedBox(height: 12),
            OnsetDateField(value: _onset, enabled: !busy, onChanged: (d) => setState(() => _onset = d)),
            const SizedBox(height: 12),
            CodeDropdown(
              label: 'Outcome so far (optional)',
              options: kAdrOutcomes,
              value: _outcome,
              optional: true,
              enabled: !busy,
              onChanged: (v) => setState(() => _outcome = v),
            ),
            const SizedBox(height: 16),
            const Text('About the patient', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14)),
            const SizedBox(height: 4),
            TextFormField(
              controller: _initials,
              enabled: !busy,
              maxLength: 10,
              textCapitalization: TextCapitalization.characters,
              decoration: const InputDecoration(labelText: 'Patient initials', hintText: 'e.g. R.S.'),
              validator: (v) => (v?.trim().isEmpty ?? true) ? 'Enter the patient\'s initials' : null,
            ),
            TextFormField(
              controller: _age,
              enabled: !busy,
              keyboardType: TextInputType.number,
              inputFormatters: [FilteringTextInputFormatter.digitsOnly],
              maxLength: 3,
              decoration: const InputDecoration(labelText: 'Age in years (optional)'),
              validator: (v) {
                final t = v?.trim() ?? '';
                if (t.isEmpty) return null;
                final n = int.tryParse(t);
                return (n == null || n > 120) ? 'Enter an age from 0 to 120' : null;
              },
            ),
            CodeDropdown(
              label: 'Gender (optional)',
              options: kAdrGenders,
              value: _gender,
              optional: true,
              enabled: !busy,
              onChanged: (v) => setState(() => _gender = v),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _batch,
              enabled: !busy,
              maxLength: 100,
              decoration: const InputDecoration(
                  labelText: 'Batch number (optional)', hintText: 'Printed on the strip or box'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: busy ? null : _submit,
              child: busy
                  ? const SizedBox(
                      width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : const Text('Send report'),
            ),
          ],
        ),
      ),
    );
  }
}
