import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../app/theme.dart';
import '../../core/animations.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/providers/bootstrap_provider.dart';
import '../../shared/widgets/minimalist_sliver_header.dart';
import '../../shared/widgets/bento_stat_card.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/shimmer_loading.dart';
import '../../shared/widgets/error_state.dart';
import '../../shared/models/user_model.dart';
import '../notifications/action_queue_screen.dart';
import '../jobs/screens/job_list_screen.dart';
import '../notifications/notification_screen.dart';

class SuperAdminHome extends StatefulWidget {
  const SuperAdminHome({super.key});

  @override
  State<SuperAdminHome> createState() => _SuperAdminHomeState();
}

class _SuperAdminHomeState extends State<SuperAdminHome> {
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
          const ActionQueueScreen(),
          const JobListScreen(),
          const NotificationScreen(),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home_filled), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.flash_on_rounded), label: 'Actions'),
          BottomNavigationBarItem(icon: Icon(Icons.build_circle_outlined), label: 'Jobs'),
          BottomNavigationBarItem(icon: Icon(Icons.notifications_none_rounded), label: 'Alerts'),
        ],
      ),
    );
  }

  Widget _buildDashboard(BootstrapProvider bootstrap, dynamic data, UserModel user) {
    if (bootstrap.status == BootstrapStatus.error) {
      return SafeArea(
        child: ErrorState(
          message: bootstrap.errorMessage ?? 'Failed to load dashboard data.',
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
                const Row(children: [
                  Expanded(child: ShimmerLoading(height: 100, borderRadius: 16)),
                  SizedBox(width: 12),
                  Expanded(child: ShimmerLoading(height: 100, borderRadius: 16)),
                ]),
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
          ],
        ),
      ),
      
      const SizedBox(height: AppSpacing.sectionGap),
      
      Row(
        children: [
          Expanded(
            child: BentoStatCard(
              icon: Icons.build_circle_outlined,
              iconColor: AppTheme.info,
              stat: summary.counters.jobs.toString(),
              label: 'Active Jobs',
              onTap: () {},
            ),
          ),
          const SizedBox(width: AppSpacing.cardGap),
          Expanded(
            child: BentoStatCard(
              icon: Icons.warning_amber_rounded,
              iconColor: summary.counters.urgentJobs > 0 ? AppTheme.danger : AppTheme.success,
              stat: summary.counters.urgentJobs.toString(),
              label: 'Urgent Actions',
              onTap: () {},
            ),
          ),
        ],
      ),
      
      const SizedBox(height: AppSpacing.cardGap),
      
      GlassCard(
        onTap: () => setState(() => _currentIndex = 1), // Jump to Actions tab
        padding: AppSpacing.cardInnerLarge,
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(Icons.inventory_2_outlined, color: AppTheme.accent, size: 20),
                    const SizedBox(width: AppSpacing.sm),
                    Text('Action Queue', style: AppTheme.h4),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                Text('${summary.counters.approvals} items pending review', style: AppTheme.bodySmall),
              ],
            ),
            const Row(
              children: [
                Text('Review', style: TextStyle(color: AppTheme.accent, fontWeight: FontWeight.w600)),
                Icon(Icons.chevron_right, color: AppTheme.accent),
              ],
            ),
          ],
        ),
      ),
      
      const SizedBox(height: AppSpacing.sectionGap),
      Text('First Action', style: AppTheme.h3),
      const SizedBox(height: AppSpacing.md),
      
      GlassCard(
        onTap: summary.firstActionKey != 'none' ? () {} : null,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
          child: Center(
            child: Text(summary.firstActionLabel, style: AppTheme.h4),
          ),
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
            unreadNotifications: data.unreadCounts.notifications,
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
}
