import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';

import '../../../app/theme.dart';
import '../../../core/providers/job_provider.dart';

class JobActionSheet {
  static void showStatusUpdate(BuildContext context, String jobId, String currentStatus) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _StatusUpdateSheet(jobId: jobId, currentStatus: currentStatus),
    );
  }

  static void showAddNote(BuildContext context, String jobId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _AddNoteSheet(jobId: jobId),
    );
  }
}

class _StatusUpdateSheet extends StatefulWidget {
  final String jobId;
  final String currentStatus;

  const _StatusUpdateSheet({required this.jobId, required this.currentStatus});

  @override
  State<_StatusUpdateSheet> createState() => _StatusUpdateSheetState();
}

class _StatusUpdateSheetState extends State<_StatusUpdateSheet> {
  bool _isSubmitting = false;
  
  final List<String> _validStatuses = [
    'Pending',
    'In Progress',
    'Waiting for Parts',
    'Ready for Delivery',
    'Delivered',
  ];

  Future<void> _updateStatus(String newStatus) async {
    if (newStatus == widget.currentStatus) {
      Navigator.pop(context);
      return;
    }

    setState(() => _isSubmitting = true);
    HapticFeedback.lightImpact();
    final success = await context.read<JobProvider>().updateJobStatus(widget.jobId, newStatus);
    if (!mounted) return;
    
    if (success) {
      HapticFeedback.mediumImpact();
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Status updated to $newStatus', style: const TextStyle(color: AppTheme.surfaceLight))),
      );
    } else {
      HapticFeedback.heavyImpact();
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to update status', style: TextStyle(color: AppTheme.surfaceLight)), backgroundColor: AppTheme.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      decoration: const BoxDecoration(
        color: AppTheme.surfaceLight,
        borderRadius: BorderRadius.only(topLeft: Radius.circular(24), topRight: Radius.circular(24)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text('Update Status', style: AppTheme.h3),
              ),
              const SizedBox(height: 16),
              if (_isSubmitting)
                const Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: CircularProgressIndicator(color: AppTheme.primary)),
                )
              else
                ..._validStatuses.map((status) {
                  final isCurrent = status == widget.currentStatus;
                  return ListTile(
                    contentPadding: const EdgeInsets.symmetric(horizontal: 24),
                    leading: Icon(
                      isCurrent ? Icons.radio_button_checked : Icons.radio_button_unchecked,
                      color: isCurrent ? AppTheme.primary : AppTheme.textTertiary,
                    ),
                    title: Text(
                      status,
                      style: AppTheme.bodyMedium.copyWith(
                        fontWeight: isCurrent ? FontWeight.w600 : FontWeight.w400,
                        color: isCurrent ? AppTheme.primary : AppTheme.textPrimary,
                      ),
                    ),
                    onTap: () => _updateStatus(status),
                  );
                }),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddNoteSheet extends StatefulWidget {
  final String jobId;

  const _AddNoteSheet({required this.jobId});

  @override
  State<_AddNoteSheet> createState() => _AddNoteSheetState();
}

class _AddNoteSheetState extends State<_AddNoteSheet> {
  final _textController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Future<void> _submitNote() async {
    final text = _textController.text.trim();
    if (text.isEmpty) return;

    setState(() => _isSubmitting = true);
    final success = await context.read<JobProvider>().addJobNote(widget.jobId, text);
    if (!mounted) return;

    if (success) {
      Navigator.pop(context);
    } else {
      setState(() => _isSubmitting = false);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Failed to add note', style: TextStyle(color: AppTheme.surfaceLight)), backgroundColor: AppTheme.danger),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      decoration: const BoxDecoration(
        color: AppTheme.surfaceLight,
        borderRadius: BorderRadius.only(topLeft: Radius.circular(24), topRight: Radius.circular(24)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Add Internal Note', style: AppTheme.h3),
              const SizedBox(height: 16),
              TextField(
                controller: _textController,
                maxLines: 4,
                decoration: InputDecoration(
                  hintText: 'Enter diagnostic details, part requirements...',
                  filled: true,
                  fillColor: AppTheme.surfaceElevated,
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: BorderSide.none,
                  ),
                ),
              ),
              const SizedBox(height: 24),
              Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.camera_alt_outlined, color: AppTheme.primary),
                    onPressed: () {
                       // Future Integration: image_picker here
                    },
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppTheme.primary,
                        foregroundColor: AppTheme.surfaceLight,
                        padding: const EdgeInsets.symmetric(vertical: 16),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.button)),
                      ),
                      onPressed: _isSubmitting ? null : _submitNote,
                      child: _isSubmitting 
                          ? const SizedBox(width: 24, height: 24, child: CircularProgressIndicator(color: AppTheme.surfaceLight, strokeWidth: 2))
                          : const Text('Add Note', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
