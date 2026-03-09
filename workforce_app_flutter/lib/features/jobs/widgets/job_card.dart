import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../../app/theme.dart';
import '../../../shared/widgets/glass_card.dart';
import '../models/job_model.dart';
import 'package:intl/intl.dart'; 

class JobCard extends StatelessWidget {
  final JobModel job;
  final VoidCallback? onTap;

  const JobCard({super.key, required this.job, this.onTap});

  @override
  Widget build(BuildContext context) {
    final isUrgent = job.priority == 'Urgent' || job.priority == 'High';
    final isCompleted = job.status == 'Completed' || job.status == 'Delivered';

    Color priorityColor = AppTheme.info;
    if (isUrgent) priorityColor = AppTheme.danger;
    else if (job.priority == 'High') priorityColor = AppTheme.warning;

    return GlassCard(
      padding: AppSpacing.cardInner,
      onTap: onTap ?? () {
        HapticFeedback.lightImpact();
        context.push('/jobs/${job.id}');
      },
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: priorityColor.withAlpha(25),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        job.priority,
                        style: AppTheme.labelSmall.copyWith(color: priorityColor),
                      ),
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        job.deviceName, 
                        style: AppTheme.h4,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                  ],
                ),
              ),
              Text(
                DateFormat('MMM d').format(job.createdAt),
                style: AppTheme.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          
          Text(
            'Customer: ${job.customerName}',
            style: AppTheme.bodyMedium,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
          const SizedBox(height: 2),
          Text(
            job.issueDescription,
            style: AppTheme.bodySmall.copyWith(color: AppTheme.textSecondary),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
          
          const SizedBox(height: AppSpacing.md),
          
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: isCompleted ? AppTheme.success.withAlpha(25) : AppTheme.neutral.withAlpha(25),
                  borderRadius: BorderRadius.circular(AppRadius.full),
                ),
                child: Text(
                  job.status,
                  style: AppTheme.labelSmall.copyWith(
                    color: isCompleted ? AppTheme.success : AppTheme.textPrimary,
                  ),
                ),
              ),
              
              if (job.assignedToName != null)
                Row(
                  children: [
                    const Icon(Icons.person_outline, size: 14, color: AppTheme.textTertiary),
                    const SizedBox(width: 4),
                    Text(
                      job.assignedToName!,
                      style: AppTheme.bodySmall,
                    ),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}
