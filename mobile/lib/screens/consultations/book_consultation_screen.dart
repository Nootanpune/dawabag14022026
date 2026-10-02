import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../models/consultation.dart';
import '../../providers/doctor_provider.dart';
import '../../services/consultation_api.dart';
import '../../services/api_service.dart';
import '../../utils/consult_format.dart';
import '../../utils/formatters.dart';
import '../doctor/widgets/doctor_card.dart';
import 'consult_payment.dart';
import '../../widgets/payments/demo_payment_sheet.dart';
import 'widgets/booking_fields.dart';

/// /consultations/book?doctorId&slotId&date&start — mode, chief complaint
/// and consent, then POST /consultations/book (C-22, C-23). An unpaid fee
/// opens Razorpay straight away; the booking is the server's record, so a
/// payment left unfinished can be completed from "My consultations".
class BookConsultationScreen extends ConsumerStatefulWidget {
  final String doctorId;
  final String slotId;
  final String? date;
  final String? start;
  const BookConsultationScreen({
    super.key,
    required this.doctorId,
    required this.slotId,
    this.date,
    this.start,
  });

  @override
  ConsumerState<BookConsultationScreen> createState() => _BookConsultationScreenState();
}

class _BookConsultationScreenState extends ConsumerState<BookConsultationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _complaint = TextEditingController();
  late final ConsultPayment _payment;
  String _mode = 'video';
  bool _consent = false;
  bool _busy = false;
  String? _error;

  /// Set once the server has booked the slot, so it is never booked twice.
  ConsultBooking? _booking;

  @override
  void initState() {
    super.initState();
    _payment = ConsultPayment(
      onPaid: () => _finish('Payment received. Your consultation is confirmed.'),
      onError: (message) => _finish(
        '$message\nYour slot is booked — pay from My consultations.',
        isError: true,
      ),
      onBusy: (busy) {
        if (mounted) setState(() => _busy = busy);
      },
      chooseDemo: (options, feePaise, pay) => showDemoPaymentSheet(context,
          amountPaise: feePaise, methods: options.methods, providers: options.providers, onPay: pay),
    );
  }

  @override
  void dispose() {
    _payment.dispose();
    _complaint.dispose();
    super.dispose();
  }

  /// Shows the outcome and opens "My consultations" (reloaded from the server).
  void _finish(String message, {bool isError = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(message),
      backgroundColor: isError ? Colors.red : null,
    ));
    context.pushReplacement('/consultations');
  }

  Future<void> _submit() async {
    final existing = _booking;
    if (existing != null) {
      await _pay(existing);
      return;
    }
    if (!(_formKey.currentState?.validate() ?? false)) return;
    if (!_consent) {
      setState(() => _error = 'Please give your consent to the teleconsultation');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    ConsultBooking booking;
    try {
      booking = await apiService.bookConsultation(
        doctorId: widget.doctorId,
        slotId: widget.slotId,
        mode: _mode,
        chiefComplaint: _complaint.text.trim(),
        consent: _consent,
      );
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = consultErrorMessage(e, fallback: 'Could not book this consultation');
      });
      return;
    }
    if (!mounted) return;
    setState(() {
      _busy = false;
      _booking = booking;
    });
    if (booking.needsPayment) {
      await _pay(booking);
    } else {
      _finish('Consultation booked.');
    }
  }

  Future<void> _pay(ConsultBooking booking) async {
    final doctorName = ref.read(doctorDetailProvider(widget.doctorId)).valueOrNull?.fullName;
    await _payment.pay(booking.id, doctorName: doctorName, feePaise: booking.feePaise);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.doctorId.isEmpty || widget.slotId.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Book consultation')),
        body: Center(
          child: TextButton(
            onPressed: () => context.go('/doctors'),
            child: const Text('Choose a doctor and a slot first'),
          ),
        ),
      );
    }
    final doctor = ref.watch(doctorDetailProvider(widget.doctorId)).valueOrNull;
    final when = [
      if (widget.date != null) formatConsultDay(widget.date),
      if (widget.start != null) formatSlotTime(widget.start, zone: true),
    ].join(', ');

    return Scaffold(
      appBar: AppBar(title: const Text('Book consultation')),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    DoctorAvatar(name: doctor?.fullName ?? ''),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(doctor?.fullName ?? 'Doctor',
                              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700)),
                          if (doctor != null) ...[
                            const SizedBox(height: 4),
                            DoctorRegistrationText(
                              qualification: doctor.qualification,
                              registrationLine: doctor.registrationLine,
                            ),
                          ],
                          if (when.isNotEmpty) ...[
                            const SizedBox(height: 6),
                            Text('$when (IST)', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
                          ],
                          if (doctor != null) ...[
                            const SizedBox(height: 2),
                            Text(doctor.feePaise > 0 ? 'Fee ${formatPrice(doctor.feePaise)}' : 'No consultation fee',
                                style: TextStyle(fontSize: 13, color: Colors.grey.shade700)),
                          ],
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 16),
            const Text('How would you like to consult?',
                style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            const SizedBox(height: 8),
            ConsultModeChips(
              value: _mode,
              enabled: !_busy && _booking == null,
              onChanged: (m) => setState(() => _mode = m),
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _complaint,
              enabled: !_busy && _booking == null,
              maxLength: 1000,
              minLines: 3,
              maxLines: 8,
              decoration: const InputDecoration(
                labelText: 'What is the problem?',
                hintText: 'Your symptoms, since when, any medicines you take',
                alignLabelWithHint: true,
              ),
              validator: (v) {
                final t = v?.trim() ?? '';
                if (t.length < 3) return 'Enter at least 3 characters';
                return null;
              },
            ),
            const SizedBox(height: 4),
            TeleconsultConsent(
              value: _consent,
              enabled: !_busy && _booking == null,
              onChanged: (v) => setState(() {
                _consent = v;
                if (v) _error = null;
              }),
            ),
            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: Colors.red, fontSize: 13)),
            ],
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: _busy ? null : _submit,
              child: _busy
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                  : Text(doctor != null && doctor.feePaise > 0
                      ? 'Book and pay ${formatPrice(doctor.feePaise)}'
                      : 'Book consultation'),
            ),
            const SizedBox(height: 12),
            Text(
              'You can cancel up to 2 hours before the slot; a paid fee is refunded in full. '
              'In an emergency, do not wait — call 112 or go to the nearest hospital.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 8),
            Text(
              'If the doctor prescribes medicines, you may buy them from any pharmacy.',
              style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
            ),
          ],
        ),
      ),
    );
  }
}
