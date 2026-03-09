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
import '../notifications/notification_screen.dart';

class EmployeeHome extends StatefulWidget {
  const EmployeeHome({super.key});

  @override
  State<EmployeeHome> createState() => _EmployeeHomeState();
}

class _EmployeeHomeState extends State<EmployeeHome> {
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
          const Center(child: Text('Attendance - Coming Soon')),
          const NotificationScreen(),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (index) => setState(() => _currentIndex = index),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home_filled), label: 'Home'),
          BottomNavigationBarItem(icon: Icon(Icons.location_on_outlined), label: 'Attendance'),
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

    // The list of widgets to animate consecutively
    final dashboardContent = [
      GlassCard(
        padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 20),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: statusColor.withAlpha(25), shape: BoxShape.circle),
              child: Icon(iconData, color: statusColor, size: 32),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(workStatus.statusText, style: AppTheme.h3),
            if (workStatus.subText.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(workStatus.subText, style: AppTheme.bodyMedium, textAlign: TextAlign.center),
            ],
            if (workStatus.actionRequired) ...[
              const SizedBox(height: AppSpacing.sectionGap),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryLight,
                    foregroundColor: AppTheme.textPrimary,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(AppRadius.button),
                      side: const BorderSide(color: AppTheme.border),
                    ),
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    elevation: 0,
                  ),
                  onPressed: () => setState(() => _currentIndex = 1),
                  child: Text(
                    summary.primaryActionLabel,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
      
      const SizedBox(height: AppSpacing.sectionGap),
      
      Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('Your Activity', style: AppTheme.h3),
          TextButton(
            onPressed: () {},
            child: const Text('View All →', style: TextStyle(color: AppTheme.textTertiary)),
          ),
        ],
      ),
      const SizedBox(height: AppSpacing.md),
      
      if (summary.firstActionKey != 'none')
        GlassCard(
          padding: AppSpacing.cardInner,
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(color: AppTheme.info.withAlpha(25), shape: BoxShape.circle),
                child: const Icon(Icons.history, color: AppTheme.info),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(summary.firstActionLabel, style: AppTheme.labelMedium),
                    Text('Today', style: AppTheme.bodySmall),
                  ],
                ),
              ),
            ],
          ),
        )
      else
        GlassCard(
          padding: AppSpacing.cardInnerLarge,
          child: Center(
            child: Text('No activity today.', style: AppTheme.bodySmall),
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
