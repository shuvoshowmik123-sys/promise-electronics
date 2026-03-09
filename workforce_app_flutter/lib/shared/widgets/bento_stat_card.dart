import 'package:flutter/material.dart';
import '../../app/theme.dart';
import 'glass_card.dart';

class BentoStatCard extends StatelessWidget {
  final IconData icon;
  final String stat;
  final String label;
  final Color iconColor;
  final VoidCallback onTap;

  const BentoStatCard({
    super.key,
    required this.icon,
    required this.stat,
    required this.label,
    required this.iconColor,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GlassCard(
      onTap: onTap,
      padding: AppSpacing.cardInner,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Icon(icon, color: iconColor, size: 24),
          const SizedBox(height: AppSpacing.sm),
          Text(stat, style: AppTheme.statLarge),
          Text(label, style: AppTheme.bodySmall),
        ],
      ),
    );
  }
}
