import 'dart:convert';

import 'package:flutter/material.dart';

import '../../config/theme.dart';
import '../../models/practitioner.dart';
import '../../services/api_service.dart';
import '../../services/practitioner_api.dart';

/// (b) Sign the requisition for [items] in the app (Sprint 44; Drugs Rules
/// r.65(9)(b)): the exact text from the server, the name as on the medical
/// council register, the declaration, and the account password re-entered now.
/// The password lives only in this form's field and is cleared after every try;
/// the server keeps the signed text and its hash.
class WrittenOrderSignForm extends StatefulWidget {
  final List<Map<String, dynamic>> items;
  final ValueChanged<WrittenOrder> onSigned;
  const WrittenOrderSignForm({super.key, required this.items, required this.onSigned});

  @override
  State<WrittenOrderSignForm> createState() => _WrittenOrderSignFormState();
}

class _WrittenOrderSignFormState extends State<WrittenOrderSignForm> {
  final _name = TextEditingController();
  final _password = TextEditingController();
  bool _declared = false;
  bool _signing = false;
  RequisitionPreview? _preview;
  String? _previewError;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadPreview();
  }

  @override
  void didUpdateWidget(WrittenOrderSignForm old) {
    super.didUpdateWidget(old);
    if (jsonEncode(old.items) != jsonEncode(widget.items)) _loadPreview();
  }

  @override
  void dispose() {
    _name.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _loadPreview() async {
    setState(() {
      _preview = null;
      _previewError = null;
    });
    if (widget.items.isEmpty) return;
    try {
      final p = await apiService.previewRequisition(widget.items);
      if (mounted) setState(() => _preview = p);
    } catch (e) {
      if (mounted) {
        setState(() => _previewError = ApiService.errorMessage(e, fallback: 'Could not prepare the requisition'));
      }
    }
  }

  bool get _ready =>
      _declared && _name.text.trim().length >= 3 && _password.text.isNotEmpty && _preview != null && !_signing;

  Future<void> _sign() async {
    setState(() {
      _signing = true;
      _error = null;
    });
    final password = _password.text;
    _password.clear(); // never kept, even for a retry
    try {
      final signed =
          await apiService.signRequisition(items: widget.items, typedName: _name.text.trim(), password: password);
      if (mounted) widget.onSigned(signed);
    } catch (e) {
      // 400 WRITTEN_ORDER_SIGNATURE_INVALID (password or name), 429 WRITTEN_ORDER_SIGN_PAUSED: the server's words
      if (mounted) setState(() => _error = ApiService.errorMessage(e, fallback: 'The written order was not signed'));
    } finally {
      if (mounted) setState(() => _signing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _preview;
    final small = TextStyle(fontSize: 12, color: Colors.grey.shade800);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (p == null && _previewError == null)
          Row(children: [
            const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
            const SizedBox(width: 8),
            Text('Preparing the requisition…', style: small),
          ]),
        if (_previewError != null) Text(_previewError!, style: TextStyle(fontSize: 12, color: Colors.red.shade900)),
        if (p != null)
          Container(
            key: const ValueKey('requisition-text'),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: Colors.grey.shade300),
                borderRadius: BorderRadius.circular(8)),
            child: Text(p.text, style: const TextStyle(fontSize: 12, height: 1.35)),
          ),
        const SizedBox(height: 10),
        TextField(
          key: const ValueKey('wo-typed-name'),
          controller: _name,
          autofillHints: const [AutofillHints.name],
          onChanged: (_) => setState(() {}),
          decoration: InputDecoration(
            labelText: 'Your name as on the medical council register',
            helperText: p != null && p.nameAsPerRegister.isNotEmpty ? 'As registered: ${p.nameAsPerRegister}' : null,
          ),
        ),
        const SizedBox(height: 8),
        TextField(
          key: const ValueKey('wo-password'),
          controller: _password,
          obscureText: true,
          enableSuggestions: false,
          autocorrect: false,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(labelText: 'Your Dawabag password (confirms it is you signing)'),
        ),
        // Transparent Material: the tile sits on the picker's tinted box
        Material(
          type: MaterialType.transparency,
          child: CheckboxListTile(
            key: const ValueKey('wo-declaration'),
            value: _declared,
            onChanged: (v) => setState(() => _declared = v ?? false),
            controlAffinity: ListTileControlAffinity.leading,
            contentPadding: EdgeInsets.zero,
            activeColor: AppTheme.brandTeal,
            title: const Text(
                'I sign this written order for the medicines above, for use in my practice and not for resale.',
                style: TextStyle(fontSize: 12.5)),
          ),
        ),
        if (_error != null) ...[
          Semantics(
            liveRegion: true,
            child: Text(_error!,
                key: const ValueKey('wo-sign-error'), style: TextStyle(fontSize: 12.5, color: Colors.red.shade900)),
          ),
          const SizedBox(height: 6),
        ],
        ElevatedButton.icon(
          key: const ValueKey('wo-sign'),
          onPressed: _ready ? _sign : null,
          icon: _signing
              ? const SizedBox(
                  width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.draw_outlined, size: 18),
          label: const Text('Sign written order'),
        ),
      ],
    );
  }
}
