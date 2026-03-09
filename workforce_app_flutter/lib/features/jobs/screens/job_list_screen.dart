import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'package:flutter_animate/flutter_animate.dart';

import '../../../app/theme.dart';
import '../../../core/animations.dart';
import '../../../core/providers/job_provider.dart';
import '../../../shared/widgets/shimmer_loading.dart';
import '../widgets/job_card.dart';

class JobListScreen extends StatefulWidget {
  const JobListScreen({super.key});

  @override
  State<JobListScreen> createState() => _JobListScreenState();
}

class _JobListScreenState extends State<JobListScreen> {
  String _selectedFilter = 'All';
  final List<String> _filters = ['All', 'Pending', 'In Progress', 'Ready for Delivery', 'Completed'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<JobProvider>().fetchJobs();
    });
  }

  void _onFilterChanged(String filter) {
    setState(() => _selectedFilter = filter);
    final statusId = filter == 'All' ? null : filter;
    context.read<JobProvider>().fetchJobs(statusId: statusId);
  }

  @override
  Widget build(BuildContext context) {
    final jobProvider = context.watch<JobProvider>();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Jobs', style: TextStyle(color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.w600)),
        backgroundColor: AppTheme.surfaceLight,
        scrolledUnderElevation: 0,
        elevation: 0,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Filter Strip
            Container(
              padding: const EdgeInsets.symmetric(vertical: 12),
              decoration: const BoxDecoration(
                border: Border(bottom: BorderSide(color: AppTheme.border)),
              ),
              child: SizedBox(
                height: 36,
                child: ListView.separated(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenHorizontal),
                  scrollDirection: Axis.horizontal,
                  itemCount: _filters.length,
                  separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.sm),
                  itemBuilder: (context, index) {
                    final filter = _filters[index];
                    final isSelected = _selectedFilter == filter;
                    return InkWell(
                      onTap: () => _onFilterChanged(filter),
                      borderRadius: BorderRadius.circular(AppRadius.full),
                      child: Container(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          color: isSelected ? AppTheme.primary : AppTheme.surfaceElevated,
                          borderRadius: BorderRadius.circular(AppRadius.full),
                          border: Border.all(
                            color: isSelected ? AppTheme.primary : AppTheme.border,
                          ),
                        ),
                        child: Text(
                          filter,
                          style: TextStyle(
                            color: isSelected ? AppTheme.surfaceLight : AppTheme.textPrimary,
                            fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
                            fontSize: 14,
                          ),
                        ),
                      ),
                    ).animate(delay: OpusAnimations.stagger * index)
                     .fadeIn(duration: OpusAnimations.normal)
                     .slideX(begin: 0.1, duration: OpusAnimations.normal, curve: OpusAnimations.snappy);
                  },
                ),
              ),
            ),
            
            // List Area
            Expanded(
              child: Builder(
                builder: (context) {
                  if (jobProvider.status == JobProviderStatus.loading && jobProvider.jobs.isEmpty) {
                    return ListView.separated(
                      padding: AppSpacing.screen,
                      itemCount: 5,
                      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.cardGap),
                      itemBuilder: (context, index) {
                        return const ShimmerLoading(height: 120)
                            .animate(delay: OpusAnimations.stagger * index)
                            .fadeIn(duration: OpusAnimations.normal);
                      },
                    );
                  }
                  
                  if (jobProvider.status == JobProviderStatus.error) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.error_outline, color: AppTheme.danger, size: 48),
                          const SizedBox(height: 16),
                          Text('Failed to load jobs', style: AppTheme.h3),
                          TextButton(
                            onPressed: () => _onFilterChanged(_selectedFilter),
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    );
                  }

                  final jobs = jobProvider.jobs;
                  if (jobs.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.inventory_2_outlined, color: AppTheme.textTertiary, size: 64),
                          const SizedBox(height: 16),
                          Text('No jobs found', style: AppTheme.h3),
                          const SizedBox(height: 4),
                          Text('Try selecting a different filter.', style: AppTheme.bodyMedium),
                        ],
                      ),
                    );
                  }

                  return RefreshIndicator(
                    color: AppTheme.accent,
                    backgroundColor: AppTheme.primary,
                    onRefresh: () async {
                      _onFilterChanged(_selectedFilter);
                    },
                    child: ListView.separated(
                      padding: AppSpacing.screen,
                      itemCount: jobs.length,
                      separatorBuilder: (_, __) => const SizedBox(height: AppSpacing.cardGap),
                      itemBuilder: (context, index) {
                        return JobCard(job: jobs[index])
                            .animate(delay: OpusAnimations.stagger * index)
                            .fadeIn(duration: OpusAnimations.normal)
                            .slideY(begin: 0.1, duration: OpusAnimations.normal, curve: OpusAnimations.snappy);
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
