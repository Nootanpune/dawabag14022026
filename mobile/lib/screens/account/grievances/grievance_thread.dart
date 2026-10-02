import 'package:flutter/material.dart';

import '../../../config/theme.dart';
import '../../../models/grievance.dart';
import '../../../utils/ist.dart';

/// One message in a complaint conversation: staff on the left, buyer right.
class GrievanceMessageBubble extends StatelessWidget {
  final GrievanceMessage message;
  const GrievanceMessageBubble({super.key, required this.message});

  @override
  Widget build(BuildContext context) {
    final staff = message.fromStaff;
    return Align(
      alignment: staff ? Alignment.centerLeft : Alignment.centerRight,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(10),
        constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
        decoration: BoxDecoration(
          color: staff ? Colors.white : AppTheme.brandTeal50,
          border: Border.all(color: staff ? Colors.grey.shade300 : AppTheme.brandTeal100),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              [
                message.author ?? (staff ? 'Dawabag support' : 'You'),
                if (message.createdAt != null) formatDateTimeIst(message.createdAt!),
              ].join(' · '),
              style: TextStyle(fontSize: 11, color: Colors.grey.shade600),
            ),
            const SizedBox(height: 4),
            Text(message.body, style: const TextStyle(fontSize: 13)),
          ],
        ),
      ),
    );
  }
}

/// Reply box under the conversation. Hidden by the caller when closed.
class GrievanceReplyBox extends StatefulWidget {
  final bool sending;
  final Future<bool> Function(String body) onSend;
  const GrievanceReplyBox({super.key, required this.sending, required this.onSend});

  @override
  State<GrievanceReplyBox> createState() => _GrievanceReplyBoxState();
}

class _GrievanceReplyBoxState extends State<GrievanceReplyBox> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    final ok = await widget.onSend(text);
    if (ok && mounted) _controller.clear();
  }

  @override
  Widget build(BuildContext context) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 6, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _controller,
                  enabled: !widget.sending,
                  minLines: 1,
                  maxLines: 4,
                  maxLength: 5000,
                  decoration: const InputDecoration(
                    hintText: 'Add a message',
                    counterText: '',
                    isDense: true,
                  ),
                ),
              ),
              IconButton(
                onPressed: widget.sending ? null : _send,
                icon: widget.sending
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.brandTeal))
                    : const Icon(Icons.send, color: AppTheme.brandTeal),
              ),
            ],
          ),
        ),
      );
}
