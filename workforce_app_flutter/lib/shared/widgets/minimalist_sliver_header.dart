import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../app/theme.dart';
import '../models/user_model.dart';

class MinimalistSliverHeader extends StatelessWidget {
  final UserModel user;
  final String branchName;
  final int unreadNotifications;
  final String greeting;

  const MinimalistSliverHeader({
    super.key,
    required this.user,
    required this.branchName,
    this.unreadNotifications = 0,
    required this.greeting,
  });

  @override
  Widget build(BuildContext context) {
    final displayName = user.displayName.trim();
    final firstName = displayName.isEmpty
        ? 'there'
        : displayName.split(" ").first;

    return SliverToBoxAdapter(
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.only(
            left: AppSpacing.screenHorizontal,
            right: AppSpacing.screenHorizontal,
            top: AppSpacing.xxl, // Massive white space padding
            bottom: AppSpacing.xl,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Text Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      greeting,
                      style: AppTheme.bodyMedium.copyWith(color: AppTheme.textTertiary),
                    ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.2, end: 0),
                    const SizedBox(height: 4),
                    Text(
                      firstName,
                      style: AppTheme.h1.copyWith(fontSize: 32),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ).animate().fadeIn(duration: 400.ms, delay: 100.ms).slideY(begin: 0.2, end: 0),
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: AppTheme.primaryMid,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        '${user.role} · $branchName',
                        style: AppTheme.labelSmall.copyWith(color: AppTheme.textSecondary),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ).animate().fadeIn(duration: 400.ms, delay: 200.ms).slideY(begin: 0.2, end: 0),
                  ],
                ),
              ),

              // Minimalist Notification Bell
              const SizedBox(width: AppSpacing.md),
              Stack(
                clipBehavior: Clip.none,
                children: [
                  GestureDetector(
                    onTap: () => context.push('/notifications'),
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(
                        color: AppTheme.primaryLight,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppTheme.border),
                      ),
                      child: const Icon(
                        Icons.notifications_none_rounded,
                        size: 24,
                        color: AppTheme.textPrimary,
                      ),
                    ),
                  ).animate().fadeIn(duration: 400.ms, delay: 300.ms).scale(begin: const Offset(0.8, 0.8)),
                  
                  if (unreadNotifications > 0)
                    Positioned(
                      right: 0,
                      top: 0,
                      child: Container(
                        padding: const EdgeInsets.all(4),
                        decoration: BoxDecoration(
                          color: AppTheme.accent,
                          shape: BoxShape.circle,
                          border: Border.all(color: AppTheme.primaryLight, width: 2),
                        ),
                        constraints: const BoxConstraints(
                          minWidth: 16,
                          minHeight: 16,
                        ),
                      )
                      .animate(onPlay: (controller) => controller.repeat(reverse: true))
                      .scale(begin: const Offset(1, 1), end: const Offset(1.15, 1.15), duration: 2000.ms, curve: Curves.easeInOutSine),
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
