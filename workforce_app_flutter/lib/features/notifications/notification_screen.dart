import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app/theme.dart';
import '../../core/providers/notification_provider.dart';
import 'widgets/notification_tile.dart';

class NotificationScreen extends StatefulWidget {
  const NotificationScreen({super.key});

  @override
  State<NotificationScreen> createState() => _NotificationScreenState();
}

class _NotificationScreenState extends State<NotificationScreen> {
  String _selectedFilter = 'All';
  final List<String> _filters = ['All', 'Urgent', 'Actions', 'Updates'];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<NotificationProvider>().fetchNotifications();
    });
  }

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<NotificationProvider>();
    final notifications = provider.notifications.where((n) {
      if (_selectedFilter == 'All') return true;
      if (_selectedFilter == 'Urgent' && n.priority == 'high') return true;
      if (_selectedFilter == 'Actions' && n.type == 'action') return true;
      if (_selectedFilter == 'Updates' && n.type == 'update') return true;
      return false;
    }).toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Alerts', style: TextStyle(color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.w600)),
        backgroundColor: AppTheme.surfaceLight,
        scrolledUnderElevation: 0,
        elevation: 0,
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Segmented Filters
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
                      onTap: () => setState(() => _selectedFilter = filter),
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
                    );
                  },
                ),
              ),
            ),
            
            // Notification List
            Expanded(
              child: Builder(
                builder: (context) {
                  if (provider.status == NotificationProviderStatus.loading && notifications.isEmpty) {
                    return const Center(child: CircularProgressIndicator(color: AppTheme.primary));
                  }
                  
                  if (provider.status == NotificationProviderStatus.error) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.error_outline, color: AppTheme.danger, size: 48),
                          const SizedBox(height: 16),
                          Text('Failed to load notifications', style: AppTheme.h3),
                          TextButton(
                            onPressed: () => context.read<NotificationProvider>().fetchNotifications(),
                            child: const Text('Retry'),
                          ),
                        ],
                      ),
                    );
                  }

                  if (notifications.isEmpty) {
                    return Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.notifications_off_outlined, color: AppTheme.textTertiary, size: 64),
                          const SizedBox(height: 16),
                          Text('You\'re all caught up!', style: AppTheme.h3),
                          const SizedBox(height: 4),
                          Text('No new alerts exactly match this filter.', style: AppTheme.bodyMedium),
                        ],
                      ),
                    );
                  }

                  return RefreshIndicator(
                    color: AppTheme.accent,
                    backgroundColor: AppTheme.primary,
                    onRefresh: () => context.read<NotificationProvider>().fetchNotifications(),
                    child: ListView.separated(
                      itemCount: notifications.length,
                      separatorBuilder: (context, index) => const Divider(height: 1, color: AppTheme.border),
                      itemBuilder: (context, index) {
                        final notification = notifications[index];
                        return Dismissible(
                          key: Key(notification.id),
                          direction: DismissDirection.endToStart,
                          background: Container(
                            alignment: Alignment.centerRight,
                            padding: const EdgeInsets.only(right: 24),
                            color: AppTheme.primary,
                            child: const Icon(Icons.check, color: AppTheme.surfaceLight),
                          ),
                          onDismissed: (direction) {
                            context.read<NotificationProvider>().markAsRead(notification.id);
                          },
                          child: NotificationTile(
                            notification: notification,
                            onTap: () {
                              // Deep linking would go here if defined
                            },
                          ),
                        );
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
