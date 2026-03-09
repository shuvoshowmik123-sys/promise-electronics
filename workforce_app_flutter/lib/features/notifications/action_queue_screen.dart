import 'package:flutter/material.dart';

import '../../app/theme.dart';
import '../../shared/widgets/glass_card.dart';

class ActionQueueScreen extends StatelessWidget {
  const ActionQueueScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Action Queue', style: TextStyle(color: AppTheme.textPrimary, fontSize: 18, fontWeight: FontWeight.w600)),
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
                child: ListView(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenHorizontal),
                  scrollDirection: Axis.horizontal,
                  children: [
                    _buildFilterPill('All Actions', true),
                    const SizedBox(width: AppSpacing.sm),
                    _buildFilterPill('Service Requests (2)', false),
                    const SizedBox(width: AppSpacing.sm),
                    _buildFilterPill('Orders (1)', false),
                    const SizedBox(width: AppSpacing.sm),
                    _buildFilterPill('Exceptions (0)', false),
                  ],
                ),
              ),
            ),
            
            Expanded(
              child: ListView(
                padding: AppSpacing.screen,
                children: [
                  Text('Service Requests', style: AppTheme.h4),
                  const SizedBox(height: AppSpacing.md),
                  _buildQueueCard(
                    context, 
                    title: 'John Doe', 
                    subtitle: 'Samsung TV • No Power', 
                    status: 'Open', 
                    actionLabel: 'Assign Tech',
                  ),
                  const SizedBox(height: AppSpacing.cardGap),
                  _buildQueueCard(
                    context, 
                    title: 'Jane Smith', 
                    subtitle: 'LG Fridge • Making noise', 
                    status: 'Pending', 
                    actionLabel: 'Review',
                  ),
                  
                  const SizedBox(height: AppSpacing.sectionGap),
                  
                  Text('Orders', style: AppTheme.h4),
                  const SizedBox(height: AppSpacing.md),
                  _buildQueueCard(
                    context, 
                    title: 'Order ORD-9921', 
                    subtitle: '3 items • ৳ 15,400', 
                    status: 'Requires Approval', 
                    actionLabel: 'Approve',
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildFilterPill(String text, bool isSelected) {
    return Container(
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
        text,
        style: TextStyle(
          color: isSelected ? AppTheme.surfaceLight : AppTheme.textPrimary,
          fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
          fontSize: 14,
        ),
      ),
    );
  }

  Widget _buildQueueCard(BuildContext context, {required String title, required String subtitle, required String status, required String actionLabel}) {
    return GlassCard(
      padding: AppSpacing.cardInner,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(title, style: AppTheme.h4),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppTheme.warning.withAlpha(25),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(status, style: AppTheme.labelSmall.copyWith(color: AppTheme.warning)),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(subtitle, style: AppTheme.bodyMedium),
          const SizedBox(height: AppSpacing.md),
          SizedBox(
            width: double.infinity,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                foregroundColor: AppTheme.primary,
                side: const BorderSide(color: AppTheme.primary),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.button)),
              ),
              onPressed: () {},
              child: Text(actionLabel, style: const TextStyle(fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }
}
