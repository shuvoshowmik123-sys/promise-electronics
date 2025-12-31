import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../config/app_theme.dart';

/// Floating diagnosis chip that appears next to detected issues
/// Shows issue name, Bangla translation, and confidence
class DiagnosisChip extends StatelessWidget {
  final String label;
  final String labelBn;
  final double confidence;
  final String issueType;
  final bool isVisible;
  final VoidCallback? onDismiss;

  const DiagnosisChip({
    super.key,
    required this.label,
    required this.labelBn,
    required this.confidence,
    this.issueType = 'general',
    this.isVisible = false,
    this.onDismiss,
  });

  IconData get _issueIcon {
    switch (issueType) {
      case 'electrical':
        return Icons.bolt;
      case 'mechanical':
        return Icons.build;
      case 'display':
        return Icons.tv;
      case 'board':
        return Icons.memory;
      default:
        return Icons.error_outline;
    }
  }

  Color get _issueColor {
    switch (issueType) {
      case 'electrical':
        return Colors.amber;
      case 'mechanical':
        return Colors.orange;
      case 'display':
        return Colors.blue;
      case 'board':
        return Colors.purple;
      default:
        return AppColors.primary;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!isVisible) return const SizedBox.shrink();

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: AppColors.primary.withValues(alpha: 0.5),
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.2),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Issue icon and label
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    padding: const EdgeInsets.all(6),
                    decoration: BoxDecoration(
                      color: _issueColor.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Icon(
                      _issueIcon,
                      size: 16,
                      color: _issueColor,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Flexible(
                    child: Text(
                      label,
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),

              // Bangla translation
              Text(
                labelBn,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.8),
                  fontSize: 12,
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 8),

              // Confidence badge
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.check_circle,
                      size: 12,
                      color: AppColors.primary,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      '${(confidence * 100).toInt()}% সঠিকতা',
                      style: const TextStyle(
                        color: AppColors.primary,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    )
        .animate(target: isVisible ? 1 : 0)
        .fadeIn(duration: 300.ms, curve: Curves.easeOut)
        .scale(begin: const Offset(0.8, 0.8), end: const Offset(1, 1));
  }
}

/// Damage assessment result chip with severity indicator
class DamageChip extends StatelessWidget {
  final String severity;
  final String severityBn;
  final List<String> damage;
  final double? estimatedCostMin;
  final double? estimatedCostMax;
  final bool isVisible;

  const DamageChip({
    super.key,
    required this.severity,
    required this.severityBn,
    required this.damage,
    this.estimatedCostMin,
    this.estimatedCostMax,
    this.isVisible = false,
  });

  Color get _severityColor {
    switch (severity.toLowerCase()) {
      case 'severe':
      case 'high':
        return Colors.red;
      case 'moderate':
      case 'medium':
        return Colors.orange;
      case 'minor':
      case 'low':
        return Colors.green;
      default:
        return Colors.yellow;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!isVisible) return const SizedBox.shrink();

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.6),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: _severityColor.withValues(alpha: 0.5),
              width: 1,
            ),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Severity indicator
              Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 10,
                    height: 10,
                    decoration: BoxDecoration(
                      color: _severityColor,
                      shape: BoxShape.circle,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '$severity Damage',
                    style: TextStyle(
                      color: _severityColor,
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),
              Text(
                severityBn,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.8),
                  fontSize: 12,
                ),
              ),

              // Damage list
              if (damage.isNotEmpty) ...[
                const SizedBox(height: 8),
                ...damage.take(2).map((d) => Padding(
                      padding: const EdgeInsets.only(bottom: 2),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.warning_amber,
                              size: 12, color: _severityColor),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              d,
                              style: const TextStyle(
                                color: Colors.white70,
                                fontSize: 11,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                        ],
                      ),
                    )),
              ],

              // Estimated cost
              if (estimatedCostMin != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    estimatedCostMax != null
                        ? '৳${estimatedCostMin!.toInt()} - ৳${estimatedCostMax!.toInt()}'
                        : '৳${estimatedCostMin!.toInt()}+',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    )
        .animate(target: isVisible ? 1 : 0)
        .fadeIn(duration: 300.ms, curve: Curves.easeOut)
        .scale(begin: const Offset(0.8, 0.8), end: const Offset(1, 1));
  }
}
