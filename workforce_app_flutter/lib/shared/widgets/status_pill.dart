import 'package:flutter/material.dart';
import '../../app/theme.dart';

class StatusPill extends StatelessWidget {
  final String status;
  final String? customLabel;
  final bool showDot;
  final bool isLarge;

  const StatusPill({
    super.key,
    required this.status,
    this.customLabel,
    this.showDot = true,
    this.isLarge = false,
  });

  @override
  Widget build(BuildContext context) {
    // Fallback to neutral if status not in map
    final color = AppTheme.statusColors[status] ?? AppTheme.neutral;
    final label = customLabel ?? status;

    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: isLarge ? 12 : 10,
        vertical: isLarge ? 6 : 4,
      ),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(AppRadius.full),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          if (showDot) ...[
            Container(
              width: isLarge ? 8 : 6,
              height: isLarge ? 8 : 6,
              decoration: BoxDecoration(
                color: color,
                shape: BoxShape.circle,
              ),
            ),
            SizedBox(width: isLarge ? 8 : 6),
          ],
          Text(
            label,
            style: isLarge 
                ? AppTheme.labelMedium.copyWith(color: color)
                : AppTheme.labelSmall.copyWith(color: color),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
          ),
        ],
      ),
    );
  }
}
