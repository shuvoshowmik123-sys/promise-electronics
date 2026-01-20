import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../providers/locale_provider.dart';
import '../../services/lens_service.dart';

/// Preview card shown after scanning a job QR code
/// Displays job info and prompts user to chat with Daktar Vai
class QrPreviewCard extends StatelessWidget {
  final JobTrackingInfo jobInfo;
  final VoidCallback onClose;
  final VoidCallback onChatWithDaktarVai;
  final bool isVisible;

  const QrPreviewCard({
    super.key,
    required this.jobInfo,
    required this.onClose,
    required this.onChatWithDaktarVai,
    this.isVisible = false,
  });

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'completed':
        return Colors.green;
      case 'in progress':
      case 'in_progress':
      case 'in-progress':
        return Colors.amber;
      case 'pending':
        return Colors.orange;
      case 'cancelled':
        return Colors.red;
      default:
        return Colors.blue;
    }
  }

  String _getStatusLabel(String status, bool isBangla) {
    switch (status.toLowerCase()) {
      case 'completed':
        return isBangla ? 'সম্পন্ন' : 'Completed';
      case 'in progress':
      case 'in_progress':
      case 'in-progress':
        return isBangla ? 'চলমান' : 'In Progress';
      case 'pending':
        return isBangla ? 'অপেক্ষমান' : 'Pending';
      case 'cancelled':
        return isBangla ? 'বাতিল' : 'Cancelled';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!isVisible) return const SizedBox.shrink();

    final isBangla = Provider.of<LocaleProvider>(context).isBangla;
    final statusColor = _getStatusColor(jobInfo.status);

    return Container(
      margin: const EdgeInsets.all(16),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [
                  Colors.white.withOpacity(0.15),
                  Colors.white.withOpacity(0.05),
                ],
              ),
              borderRadius: BorderRadius.circular(24),
              border: Border.all(
                color: Colors.white.withOpacity(0.2),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.2),
                  blurRadius: 20,
                  offset: const Offset(0, 10),
                ),
              ],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Success header
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.2),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check_circle,
                        color: AppColors.primary,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isBangla ? 'স্ক্যান সফল' : 'Scanned Successfully',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Text(
                            isBangla ? 'জব তথ্য পাওয়া গেছে' : 'Job info found',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.7),
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      onPressed: onClose,
                      icon: Icon(
                        Icons.close,
                        color: Colors.white.withOpacity(0.7),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 16),
                Divider(color: Colors.white.withOpacity(0.2)),
                const SizedBox(height: 16),

                // Job info
                _buildInfoRow(
                  icon: Icons.tag,
                  label: isBangla ? 'জব নম্বর' : 'Job ID',
                  value: jobInfo.id,
                ),
                const SizedBox(height: 12),
                _buildInfoRow(
                  icon: Icons.tv,
                  label: isBangla ? 'ডিভাইস' : 'Device',
                  value: jobInfo.deviceDisplay,
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(
                      Icons.circle,
                      size: 12,
                      color: statusColor,
                    ),
                    const SizedBox(width: 8),
                    Text(
                      isBangla ? 'স্ট্যাটাস' : 'Status',
                      style: TextStyle(
                        color: Colors.white.withOpacity(0.7),
                        fontSize: 12,
                      ),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        color: statusColor.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: statusColor.withOpacity(0.5),
                        ),
                      ),
                      child: Text(
                        _getStatusLabel(jobInfo.status, isBangla),
                        style: TextStyle(
                          color: statusColor,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),

                if (jobInfo.estimatedCost != null) ...[
                  const SizedBox(height: 12),
                  _buildInfoRow(
                    icon: Icons.attach_money,
                    label: isBangla ? 'আনুমানিক খরচ' : 'Est. Cost',
                    value: '৳${jobInfo.estimatedCost!.toInt()}',
                  ),
                ],

                const SizedBox(height: 20),
                Divider(color: Colors.white.withOpacity(0.2)),
                const SizedBox(height: 16),

                // Daktar Vai prompt
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(10),
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [
                            AppColors.primary.withOpacity(0.3),
                            AppColors.primary.withOpacity(0.1),
                          ],
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(
                        Icons.smart_toy_rounded,
                        color: AppColors.primary,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isBangla
                                ? 'ডাক্তার ভাই এর সাথে কথা বলতে চান?'
                                : 'Chat with Daktar Vai about this?',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            isBangla
                                ? 'এই মেরামত সম্পর্কে জিজ্ঞাসা করুন'
                                : 'Ask about this repair',
                            style: TextStyle(
                              color: Colors.white.withOpacity(0.6),
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 16),

                // Action buttons
                Row(
                  children: [
                    // Close button
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () {
                          HapticFeedback.lightImpact();
                          onClose();
                        },
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: BorderSide(
                            color: Colors.white.withOpacity(0.3),
                          ),
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                        ),
                        child: Text(
                          isBangla ? 'না / Close' : 'Close',
                          style: const TextStyle(fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    // Chat button
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: () {
                          HapticFeedback.mediumImpact();
                          onChatWithDaktarVai();
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(14),
                          ),
                          elevation: 0,
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.chat_bubble_outline, size: 18),
                            const SizedBox(width: 8),
                            Text(
                              isBangla ? 'হ্যাঁ, চ্যাট করুন' : 'Yes, Chat',
                              style:
                                  const TextStyle(fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    )
        .animate(target: isVisible ? 1 : 0)
        .fadeIn(duration: 300.ms)
        .slideY(begin: 0.3, end: 0, curve: Curves.easeOutCubic);
  }

  Widget _buildInfoRow({
    required IconData icon,
    required String label,
    required String value,
  }) {
    return Row(
      children: [
        Icon(
          icon,
          size: 16,
          color: Colors.white.withOpacity(0.5),
        ),
        const SizedBox(width: 8),
        Text(
          label,
          style: TextStyle(
            color: Colors.white.withOpacity(0.7),
            fontSize: 12,
          ),
        ),
        const Spacer(),
        Text(
          value,
          style: const TextStyle(
            color: Colors.white,
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
