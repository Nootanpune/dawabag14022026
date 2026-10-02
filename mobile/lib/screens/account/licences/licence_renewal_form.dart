import 'package:flutter/material.dart';
import '../../../models/licence_draft.dart';
import '../../../utils/ist.dart';
import 'licence_copy_picker.dart';

/// Sends the licence and the optional copy (photo or PDF); returns a plain error, or null when sent.
typedef LicenceRenewalSubmit = Future<String?> Function(LicenceDraft draft, LicenceCopy? copy);

/// "Send a renewed or another licence" (Sprint 32, as the web's YourLicencesSection):
/// the form as printed, the number, the valid-till date and an optional photo or
/// PDF of the licence (PDF since Sprint 34). Checked here with the server's words first; the server checks again.
class LicenceRenewalForm extends StatefulWidget {
  final String? customerType;
  /// Camera, gallery or PDF; null when cancelled
  final Future<LicenceCopy?> Function() pickCopy;
  final LicenceRenewalSubmit onSubmit;
  /// India date YYYY-MM-DD (tests pass a fixed day)
  final String? today;

  const LicenceRenewalForm({
    super.key,
    required this.customerType,
    required this.pickCopy,
    required this.onSubmit,
    this.today,
  });

  @override
  State<LicenceRenewalForm> createState() => _LicenceRenewalFormState();
}

class _LicenceRenewalFormState extends State<LicenceRenewalForm> {
  final _number = TextEditingController();
  final _formName = TextEditingController();
  final _issuedBy = TextEditingController();
  String _form = '';
  String _validUpto = '';
  LicenceCopy? _copy;
  bool _pending = false;
  List<String> _problems = const [];

  String get _today => widget.today ?? todayIst();

  @override
  void dispose() {
    _number.dispose();
    _formName.dispose();
    _issuedBy.dispose();
    super.dispose();
  }

  LicenceDraft get _draft => LicenceDraft(
        form: _form,
        formName: _formName.text,
        number: _number.text,
        issuedBy: _issuedBy.text,
        validUpto: _validUpto,
      );

  Future<void> _pickDate() async {
    final today = DateTime.parse(_today);
    final current = _validUpto.isEmpty ? null : DateTime.tryParse(_validUpto);
    final picked = await showDatePicker(
      context: context,
      initialDate: current ?? DateTime(today.year + 1, today.month, today.day),
      firstDate: today,
      lastDate: DateTime(today.year + 30),
      helpText: 'Valid till',
    );
    if (picked != null) setState(() => _validUpto = calendarDayToApi(picked));
  }

  Future<void> _chooseCopy() async {
    final copy = await widget.pickCopy();
    if (copy == null || !mounted) return;
    final problem = licenceCopyProblem(copy);
    setState(() {
      _problems = problem == null ? const [] : [problem];
      if (problem == null) _copy = copy;
    });
  }

  Future<void> _submit() async {
    final problems = licenceDraftProblems(_draft, _today);
    setState(() => _problems = problems);
    if (problems.isNotEmpty) return;
    setState(() => _pending = true);
    final error = await widget.onSubmit(_draft, _copy);
    if (!mounted) return;
    setState(() {
      _pending = false;
      _problems = error == null ? const [] : [error];
    });
  }

  @override
  Widget build(BuildContext context) {
    final forms = licenceFormsFor(widget.customerType);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Choose the form as printed on the licence. It counts once Dawabag has checked it.',
            style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
        const SizedBox(height: 14),
        DropdownButtonFormField<String>(
          key: const ValueKey('licence-form'),
          initialValue: _form.isEmpty ? null : _form,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Licence form'),
          items: [
            for (final f in forms)
              DropdownMenuItem(value: f.code, child: Text('${f.label} — ${f.hint}', overflow: TextOverflow.ellipsis)),
          ],
          onChanged: (v) => setState(() => _form = v ?? ''),
        ),
        if (_form == 'other') ...[
          const SizedBox(height: 12),
          TextField(
            controller: _formName,
            maxLength: 80,
            decoration: const InputDecoration(labelText: 'Name of the licence form', counterText: ''),
          ),
        ],
        const SizedBox(height: 12),
        TextField(
          key: const ValueKey('licence-number'),
          controller: _number,
          maxLength: 100,
          textCapitalization: TextCapitalization.characters,
          decoration: const InputDecoration(labelText: 'Licence number', counterText: ''),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _issuedBy,
          maxLength: 200,
          decoration: const InputDecoration(labelText: 'Issued by (optional)', counterText: ''),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _pickDate,
          icon: const Icon(Icons.event, size: 20),
          label: Text(_validUpto.isEmpty ? 'Choose the valid-till date' : 'Valid till ${formatDateIst(_validUpto)}'),
        ),
        const SizedBox(height: 12),
        OutlinedButton.icon(
          onPressed: _pending ? null : _chooseCopy,
          icon: Icon(_copy?.isPdf == true ? Icons.picture_as_pdf_outlined : Icons.photo_camera_outlined, size: 20),
          label: Text(_copy == null ? 'Add a photo or PDF of the licence (optional)' : _copy!.label),
        ),
        if (_copy != null)
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton(onPressed: () => setState(() => _copy = null), child: const Text('Remove file')),
          ),
        Text('PDF, JPG or PNG, up to 5 MB. Only you and Dawabag’s team can open it.',
            style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
        if (_problems.isNotEmpty) ...[
          const SizedBox(height: 12),
          Semantics(
            liveRegion: true,
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: Colors.red.shade50,
                border: Border.all(color: Colors.red.shade200),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [for (final p in _problems) Text('• $p', style: TextStyle(color: Colors.red.shade900))],
              ),
            ),
          ),
        ],
        const SizedBox(height: 16),
        ElevatedButton(
          onPressed: _pending ? null : _submit,
          child: _pending
              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Send for checking'),
        ),
      ],
    );
  }
}
