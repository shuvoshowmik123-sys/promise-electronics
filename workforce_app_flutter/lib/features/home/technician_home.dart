import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../app/theme.dart';
import '../../core/animations.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/providers/bootstrap_provider.dart';
import '../../shared/widgets/minimalist_sliver_header.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/shimmer_loading.dart';
import '../../shared/widgets/error_state.dart';
import '../../shared/models/user_model.dart';
import '../jobs/screens/job_list_screen.dart';
import '../notifications/notification_screen.dart';

class TechnicianHome extends StatefulWidget {
  const TechnicianHome({super.key});

  @override
  State<TechnicianHome> createState() => _TechnicianHomeState();
}

class _TechnicianHomeState extends State<TechnicianHome> {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<BootstrapProvider>().loadBootstrap();
    });
  }

  String _getGreeting() {
    final hour = DateTime.now().hour;
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final bootstrap = context.watch<BootstrapProvider>();
    
    if (user == null) return const Scaffold();

    final data = bootstrap.data;

    return Scaffold(
      extendBodyBehindAppBar: true,
      body: IndexedStack(
        index: _currentIndex,
        children: [
          _buildDashboard(bootstrap, data, user),
          const JobListScreen(),
          const NotificationScreen(),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.build_circle_outlined), label: 'Jobs'),
          BottomNavigationBarItem(icon: Icon(Icons.history_toggle_off_outlined), label: 'All Jobs'),
          BottomNavigationBarItem(icon: Icon(Icons.notifications_none_rounded), label: 'Alerts'),
        ],
      ),
    );
  }

  Widget _buildDashboard(BootstrapProvider bootstrap, dynamic data, UserModel user) {
    if (bootstrap.status == BootstrapStatus.error) {
      return SafeArea(
        child: ErrorState(
          message: bootstrap.errorMessage ?? 'Failed to load dashboard.',
          onRetry: () => context.read<BootstrapProvider>().loadBootstrap(),
        ),
      );
    }

    if (bootstrap.status == BootstrapStatus.loading || bootstrap.status == BootstrapStatus.initial || data == null) {
      return CustomScrollView(
        slivers: [
          MinimalistSliverHeader(
            user: user,
            branchName: 'Loading...',
            greeting: _getGreeting(),
          ),
          SliverPadding(
            padding: AppSpacing.screen,
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                const ShimmerLoading(height: 72, borderRadius: 16),
                const SizedBox(height: 16),
                const ShimmerLoading(height: 120, borderRadius: 16),
                const SizedBox(height: 16),
                const ShimmerLoading(height: 80, borderRadius: 16),
              ]),
            ),
          ),
        ],
      );
    }

    final summary = data!.homeSummary;
    final workStatus = data.workStatus;

    Color statusColor = AppTheme.neutral;
    if (workStatus.statusColor == 'success') { statusColor = AppTheme.success; }
    else if (workStatus.statusColor == 'warning') { statusColor = AppTheme.warning; }
    else if (workStatus.statusColor == 'danger') { statusColor = AppTheme.danger; }

    IconData iconData = Icons.info_outline;
    if (workStatus.icon == 'check_circle_rounded') { iconData = Icons.check_circle_rounded; }
    if (workStatus.icon == 'warning_amber_rounded') { iconData = Icons.warning_amber_rounded; }

    final dashboardContent = [
      GlassCard(
        padding: AppSpacing.cardInner,
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(color: statusColor.withAlpha(25), shape: BoxShape.circle),
              child: Icon(iconData, color: statusColor),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(workStatus.statusText, style: AppTheme.labelMedium),
                  if (workStatus.subText.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(workStatus.subText, style: AppTheme.bodySmall),
                  ]
                ],
              ),
            ),
            if (workStatus.actionRequired)
              TextButton(
                onPressed: () {
                   setState(() => _currentIndex = 1); // Jump to Attendance tab
                },
                style: TextButton.styleFrom(
                  foregroundColor: AppTheme.accent,
                  textStyle: const TextStyle(fontWeight: FontWeight.w600),
                ),
                child: const Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('Action'),
                    SizedBox(width: 4),
                    Icon(Icons.arrow_forward, size: 16),
                  ],
                ),
              ),
          ],
        ),
      ),
      
      const SizedBox(height: AppSpacing.sectionGap),
      
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('My Jobs', style: AppTheme.h3),
          TextButton(
            onPressed: () {},
            child: const Text('View All →', style: TextStyle(color: AppTheme.textTertiary)),
          ),
        ],
      ),
      const SizedBox(height: AppSpacing.md),
      
      SizedBox(
        height: 36,
        child: ListView(
          scrollDirection: Axis.horizontal,
          children: [
            _buildStatPill('${summary.counters.jobs} Assigned', AppTheme.info),
            const SizedBox(width: AppSpacing.sm),
            _buildStatPill('${summary.counters.urgentJobs} Urgent', AppTheme.danger),
          ],
        ),
      ),
      
      const SizedBox(height: AppSpacing.md),
      
      if (summary.firstJob != null)
        _buildFirstJobCard(summary.firstJob!)
      else
        GlassCard(
          padding: AppSpacing.cardInnerLarge,
          child: Center(
            child: Text('No active jobs assigned.', style: AppTheme.bodySmall),
          ),
        ),
    ];

    return RefreshIndicator(
      color: AppTheme.accent,
      backgroundColor: AppTheme.primaryLight,
      onRefresh: () => context.read<BootstrapProvider>().loadBootstrap(),
      child: CustomScrollView(
        physics: const AlwaysScrollableScrollPhysics(),
        slivers: [
          MinimalistSliverHeader(
            user: user,
            branchName: data.branch?.name ?? 'Promise Electronics',
            unreadNotifications: data.unreadCounts.notifications ?? 0,
            greeting: _getGreeting(),
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(AppSpacing.screenHorizontal, 0, AppSpacing.screenHorizontal, AppSpacing.xxl),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: dashboardContent.animate(interval: OpusAnimations.stagger).fadeIn(duration: OpusAnimations.normal, delay: OpusAnimations.normal).slideY(begin: 0.05, duration: OpusAnimations.normal, curve: OpusAnimations.snappy),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFirstJobCard(Map<String, dynamic> job) {
    final priority = job['priority']?.toString() ?? 'Normal';
    final isUrgent = priority == 'Urgent' || priority == 'High';

    return GlassCard(
      padding: AppSpacing.cardInner,
      onTap: () {},
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: isUrgent ? AppTheme.danger.withAlpha(25) : AppTheme.warning.withAlpha(25),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      priority,
                      style: AppTheme.labelSmall.copyWith(
                        color: isUrgent ? AppTheme.danger : AppTheme.warning,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Text(job['device']?.toString() ?? 'Unknown Device', style: AppTheme.h4),
                ],
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xs),
          Text('Customer: ${job['customer'] ?? 'Unknown'}', style: AppTheme.bodyMedium),
          Text('Status: ${job['status'] ?? 'Unknown'}', style: AppTheme.bodySmall),
          const SizedBox(height: AppSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.info.withAlpha(25),
                  borderRadius: BorderRadius.circular(100),
                ),
                child: Text(job['nextAction']?.toString() ?? 'Open job', style: AppTheme.labelSmall.copyWith(color: AppTheme.info)),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildStatPill(String text, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppTheme.surfaceElevated,
        borderRadius: BorderRadius.circular(AppRadius.full),
        border: Border.all(color: color.withAlpha(51), width: 1),
      ),
      child: Text(
        text,
        style: TextStyle(color: AppTheme.textPrimary, fontWeight: FontWeight.w600, fontSize: 13),
      ),
    );
  }
}
