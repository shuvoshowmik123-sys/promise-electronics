import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../app/theme.dart';
import '../../../core/providers/job_provider.dart';
import '../../../shared/widgets/glass_card.dart';
import 'package:intl/intl.dart';
import '../widgets/job_action_sheet.dart';

class JobDetailScreen extends StatefulWidget {
  final String jobId;
  const JobDetailScreen({super.key, required this.jobId});

  @override
  State<JobDetailScreen> createState() => _JobDetailScreenState();
}

class _JobDetailScreenState extends State<JobDetailScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<JobProvider>().fetchJobDetail(widget.jobId);
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<JobProvider>();
    final job = provider.selectedJob;
    final isLoading = provider.status == JobProviderStatus.loading && job?.id != widget.jobId;

    return Scaffold(
      appBar: AppBar(
        title: Text('Job #${widget.jobId}', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 18)),
        backgroundColor: AppTheme.surfaceLight,
        foregroundColor: AppTheme.textPrimary,
        elevation: 0,
        centerTitle: true,
        actions: [
          IconButton(
            icon: const Icon(Icons.more_vert),
            onPressed: () {},
          )
        ],
      ),
      body: SafeArea(
        child: Builder(
          builder: (context) {
            if (provider.status == JobProviderStatus.error) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline, color: AppTheme.danger, size: 48),
                    const SizedBox(height: 16),
                    Text('Failed to load job', style: AppTheme.h3),
                    TextButton(
                      onPressed: () => context.read<JobProvider>().fetchJobDetail(widget.jobId),
                      child: const Text('Retry'),
                    ),
                  ],
                ),
              );
            }

            if (isLoading || job == null) {
              return const Center(child: CircularProgressIndicator(color: AppTheme.primary));
            }

            final isUrgent = job.priority == 'Urgent' || job.priority == 'High';

            return RefreshIndicator(
              color: AppTheme.accent,
              backgroundColor: AppTheme.primary,
              onRefresh: () async {
                await context.read<JobProvider>().fetchJobDetail(widget.jobId);
              },
              child: Stack(
                children: [
                  SingleChildScrollView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.fromLTRB(AppSpacing.screenHorizontal, AppSpacing.screenVertical, AppSpacing.screenHorizontal, 100),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Section 1: Top Status Banner
                        GlassCard(
                          padding: AppSpacing.cardInner,
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.spaceBetween,
                            children: [
                              Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(job.status, style: AppTheme.h3.copyWith(color: AppTheme.primary)),
                                  const SizedBox(height: 4),
                                  Text('Updated ${DateFormat('MMM d, h:mm a').format(job.updatedAt)}', style: AppTheme.bodySmall),
                                ],
                              ),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                                decoration: BoxDecoration(
                                  color: isUrgent ? AppTheme.danger.withAlpha(25) : AppTheme.info.withAlpha(25),
                                  borderRadius: BorderRadius.circular(AppRadius.full),
                                ),
                                child: Text(job.priority, style: TextStyle(color: isUrgent ? AppTheme.danger : AppTheme.info, fontWeight: FontWeight.bold)),
                              ),
                            ],
                          ),
                        ),
                        
                        const SizedBox(height: AppSpacing.sectionGap),
                        
                        // Section 2: Customer & Device
                        Text('Customer Details', style: AppTheme.h4),
                        const SizedBox(height: AppSpacing.md),
                        GlassCard(
                          padding: AppSpacing.cardInner,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  const Icon(Icons.person_outline, size: 20, color: AppTheme.textSecondary),
                                  const SizedBox(width: AppSpacing.sm),
                                  Text(job.customerName, style: AppTheme.bodyMedium),
                                ],
                              ),
                              if (job.customerPhone != null && job.customerPhone!.isNotEmpty) ...[
                                const SizedBox(height: 12),
                                InkWell(
                                  onTap: () {
                                    // Future url_launcher integration here
                                  },
                                  child: Row(
                                    children: [
                                      const Icon(Icons.phone_outlined, size: 20, color: AppTheme.primary),
                                      const SizedBox(width: AppSpacing.sm),
                                      Text(job.customerPhone!, style: AppTheme.bodyMedium.copyWith(color: AppTheme.primary, fontWeight: FontWeight.w600)),
                                    ],
                                  ),
                                ),
                              ],
                              const Divider(height: 24, color: AppTheme.border),
                              Row(
                                children: [
                                  const Icon(Icons.devices_outlined, size: 20, color: AppTheme.textSecondary),
                                  const SizedBox(width: AppSpacing.sm),
                                  Text(job.deviceName, style: AppTheme.bodyMedium.copyWith(fontWeight: FontWeight.w600)),
                                ],
                              ),
                            ],
                          ),
                        ),

                        const SizedBox(height: AppSpacing.sectionGap),

                        // Section 3: Issue Details
                        Text('Reported Issue', style: AppTheme.h4),
                        const SizedBox(height: AppSpacing.md),
                        GlassCard(
                          padding: AppSpacing.cardInner,
                          child: Text(job.issueDescription, style: AppTheme.bodyMedium.copyWith(height: 1.5)),
                        ),

                        const SizedBox(height: AppSpacing.sectionGap),

                        // Section 4: Notes
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('Diagnostic Notes', style: AppTheme.h4),
                            TextButton.icon(
                              onPressed: () => JobActionSheet.showAddNote(context, job.id),
                              icon: const Icon(Icons.add, size: 18),
                              label: const Text('Add Note'),
                            ),
                          ],
                        ),
                        if (job.notes.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: Center(child: Text('No notes attached to this job.', style: TextStyle(color: AppTheme.textTertiary))),
                          )
                        else
                          ...job.notes.map((note) => Container(
                            margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: AppTheme.surfaceElevated,
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: AppTheme.border),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Row(
                                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                  children: [
                                    Text(note.authorName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                                    Text(DateFormat('MMM d, h:mm a').format(note.createdAt), style: const TextStyle(color: AppTheme.textTertiary, fontSize: 12)),
                                  ],
                                ),
                                const SizedBox(height: 8),
                                Text(note.text, style: const TextStyle(fontSize: 14, height: 1.4)),
                              ],
                            ),
                          )),
                      ],
                    ),
                  ),

                  // Fixed Bottom Bar
                  Positioned(
                    bottom: 0,
                    left: 0,
                    right: 0,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
                      decoration: BoxDecoration(
                        color: AppTheme.surfaceLight,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withAlpha(10),
                            blurRadius: 10,
                            offset: const Offset(0, -4),
                          )
                        ],
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: OutlinedButton(
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppTheme.textPrimary,
                                side: const BorderSide(color: AppTheme.border),
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.button)),
                              ),
                              onPressed: () => JobActionSheet.showStatusUpdate(context, job.id, job.status),
                              child: const Text('Change Status', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppTheme.primary,
                                foregroundColor: AppTheme.surfaceLight,
                                padding: const EdgeInsets.symmetric(vertical: 16),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.button)),
                              ),
                              onPressed: () => JobActionSheet.showAddNote(context, job.id),
                              child: const Text('Add Note', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}
