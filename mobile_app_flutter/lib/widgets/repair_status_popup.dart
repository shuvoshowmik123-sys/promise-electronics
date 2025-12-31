import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/locale_provider.dart';
import 'package:url_launcher/url_launcher.dart';

/// A premium popup dialog showing repair status with animated timeline
class RepairStatusPopup extends StatefulWidget {
  final Map<String, dynamic> repair;

  const RepairStatusPopup({super.key, required this.repair});

  static void show(BuildContext context, Map<String, dynamic> repair) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => RepairStatusPopup(repair: repair),
    );
  }

  @override
  State<RepairStatusPopup> createState() => _RepairStatusPopupState();
}

class _RepairStatusPopupState extends State<RepairStatusPopup>
    with SingleTickerProviderStateMixin {
  late ScrollController _scrollController;
  late AnimationController _animationController;
  late Animation<double> _progressAnimation;
  Timer? _autoScrollTimer;
  int _currentStepIndex = 0;

  // Tracking steps matching the website
  static const List<Map<String, dynamic>> _trackingSteps = [
    {
      'status': 'Request Received',
      'icon': Icons.inbox_rounded,
      'description': 'Your request is being reviewed by our team',
      'descriptionBn': 'আপনার অনুরোধ আমাদের দল দ্বারা পর্যালোচনা করা হচ্ছে',
    },
    {
      'status': 'Received',
      'icon': Icons.check_circle_outline,
      'description': 'Your TV has been received at our service center',
      'descriptionBn': 'আপনার টিভি আমাদের সার্ভিস সেন্টারে গ্রহণ করা হয়েছে',
    },
    {
      'status': 'Technician Assigned',
      'icon': Icons.person_outline,
      'description': 'A technician has been assigned to your job',
      'descriptionBn': 'আপনার কাজে একজন টেকনিশিয়ান নিয়োগ করা হয়েছে',
    },
    {
      'status': 'Diagnosis Completed',
      'icon': Icons.search,
      'description': 'Issue has been diagnosed',
      'descriptionBn': 'সমস্যা চিহ্নিত করা হয়েছে',
    },
    {
      'status': 'Parts Pending',
      'icon': Icons.schedule,
      'description': 'Waiting for replacement parts',
      'descriptionBn': 'প্রতিস্থাপনের যন্ত্রাংশের জন্য অপেক্ষা করা হচ্ছে',
    },
    {
      'status': 'Repairing',
      'icon': Icons.build_circle_outlined,
      'description': 'Repair work in progress',
      'descriptionBn': 'মেরামতের কাজ চলছে',
    },
    {
      'status': 'Testing',
      'icon': Icons.fact_check_outlined,
      'description': 'Final testing and quality check',
      'descriptionBn': 'চূড়ান্ত পরীক্ষা এবং মান পরীক্ষা',
    },
    {
      'status': 'Ready for Delivery',
      'icon': Icons.local_shipping_outlined,
      'description': 'Your device is ready for pickup/delivery',
      'descriptionBn': 'আপনার ডিভাইস পিকআপ/ডেলিভারির জন্য প্রস্তুত',
    },
    {
      'status': 'Delivered',
      'icon': Icons.check_circle,
      'description': 'Order completed successfully',
      'descriptionBn': 'অর্ডার সফলভাবে সম্পন্ন হয়েছে',
    },
  ];

  @override
  void initState() {
    super.initState();
    _scrollController = ScrollController();
    _animationController = AnimationController(
      duration: const Duration(milliseconds: 1500),
      vsync: this,
    );

    // Find current step index
    final currentStatus = widget.repair['trackingStatus'] ??
        widget.repair['status'] ??
        'Request Received';
    _currentStepIndex = _findStepIndex(currentStatus);

    // Calculate progress
    final progress = (_currentStepIndex + 1) / _trackingSteps.length;
    _progressAnimation = Tween<double>(begin: 0.0, end: progress).animate(
      CurvedAnimation(parent: _animationController, curve: Curves.easeOutCubic),
    );

    _animationController.forward();

    // Scroll to current position after build
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scrollToCurrentStep();
    });
  }

  int _findStepIndex(String status) {
    // Map various status names to step index
    final statusLower = status.toLowerCase();

    if (statusLower.contains('request') || statusLower == 'pending') {
      return 0;
    } else if (statusLower == 'received' || statusLower.contains('picked')) {
      return 1;
    } else if (statusLower.contains('technician') ||
        statusLower.contains('assigned')) {
      return 2;
    } else if (statusLower.contains('diagnos')) {
      return 3;
    } else if (statusLower.contains('parts') ||
        statusLower.contains('waiting')) {
      return 4;
    } else if (statusLower.contains('repair')) {
      return 5;
    } else if (statusLower.contains('test')) {
      return 6;
    } else if (statusLower.contains('ready')) {
      return 7;
    } else if (statusLower.contains('deliver') ||
        statusLower.contains('complet')) {
      return 8;
    }
    return 0;
  }

  void _scrollToCurrentStep() {
    if (!_scrollController.hasClients) return;

    // Calculate position (each step is approx 100px tall)
    final targetPosition = (_currentStepIndex * 100.0) - 50.0;
    final maxScroll = _scrollController.position.maxScrollExtent;
    final scrollTo = targetPosition.clamp(0.0, maxScroll);

    _scrollController.animateTo(
      scrollTo,
      duration: const Duration(milliseconds: 500),
      curve: Curves.easeInOut,
    );
  }

  void _startAutoScrollTimer() {
    _autoScrollTimer?.cancel();
    _autoScrollTimer = Timer(const Duration(seconds: 3), () {
      _scrollToCurrentStep();
    });
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _animationController.dispose();
    _autoScrollTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isBangla = Provider.of<LocaleProvider>(context).isBangla;
    final size = MediaQuery.of(context).size;

    // Extract repair data
    final deviceName =
        '${widget.repair['brand'] ?? 'TV'} ${widget.repair['screenSize'] ?? ''}'
            .trim();
    final ticketNumber = widget.repair['ticketNumber'] ?? 'N/A';
    final currentStatus =
        widget.repair['trackingStatus'] ?? widget.repair['status'] ?? 'Pending';

    return Container(
      height: size.height * 0.85,
      decoration: BoxDecoration(
        color: isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withValues(alpha: 0.2),
            blurRadius: 30,
            spreadRadius: 5,
          ),
        ],
      ),
      child: Column(
        children: [
          // Handle bar
          Container(
            margin: const EdgeInsets.only(top: 12),
            width: 40,
            height: 4,
            decoration: BoxDecoration(
              color: isDark ? AppColors.borderDark : AppColors.borderLight,
              borderRadius: BorderRadius.circular(2),
            ),
          ),

          // Header with progress ring
          _buildHeader(context, isDark, isBangla, deviceName, ticketNumber,
              currentStatus),

          // Scrollable Timeline
          Expanded(
            child: NotificationListener<ScrollNotification>(
              onNotification: (notification) {
                if (notification is ScrollEndNotification) {
                  _startAutoScrollTimer();
                }
                return false;
              },
              child: _buildTimeline(context, isDark, isBangla),
            ),
          ),

          // Action buttons
          _buildActionButtons(context, isDark, isBangla),
        ],
      ),
    );
  }

  Widget _buildHeader(BuildContext context, bool isDark, bool isBangla,
      String deviceName, String ticketNumber, String currentStatus) {
    return Container(
      padding: const EdgeInsets.all(24),
      child: Column(
        children: [
          // Progress Ring
          AnimatedBuilder(
            animation: _progressAnimation,
            builder: (context, child) {
              return Stack(
                alignment: Alignment.center,
                children: [
                  // Background ring
                  SizedBox(
                    width: 120,
                    height: 120,
                    child: CircularProgressIndicator(
                      value: 1.0,
                      strokeWidth: 8,
                      backgroundColor:
                          isDark ? AppColors.borderDark : AppColors.borderLight,
                      valueColor: AlwaysStoppedAnimation<Color>(
                        isDark ? AppColors.borderDark : AppColors.borderLight,
                      ),
                    ),
                  ),
                  // Progress ring
                  SizedBox(
                    width: 120,
                    height: 120,
                    child: CircularProgressIndicator(
                      value: _progressAnimation.value,
                      strokeWidth: 8,
                      backgroundColor: Colors.transparent,
                      valueColor: const AlwaysStoppedAnimation<Color>(
                          AppColors.primary),
                    ),
                  ),
                  // Center content
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(
                        Icons.tv,
                        size: 32,
                        color: AppColors.primary,
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${(_progressAnimation.value * 100).toInt()}%',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.bold,
                          color: isDark
                              ? AppColors.textMainDark
                              : AppColors.textMainLight,
                        ),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),

          const SizedBox(height: 20),

          // Device name
          Text(
            deviceName.isNotEmpty ? deviceName : 'TV Repair',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
            ),
          ),

          const SizedBox(height: 4),

          // Ticket number
          Text(
            '${isBangla ? 'টিকেট' : 'Ticket'} #$ticketNumber',
            style: TextStyle(
              fontSize: 14,
              color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
            ),
          ),

          const SizedBox(height: 12),

          // Current status badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            decoration: BoxDecoration(
              color: AppColors.primary.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.3),
              ),
            ),
            child: Text(
              currentStatus,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: AppColors.primary,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTimeline(BuildContext context, bool isDark, bool isBangla) {
    return ListView.builder(
      controller: _scrollController,
      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
      itemCount: _trackingSteps.length,
      itemBuilder: (context, index) {
        final step = _trackingSteps[index];
        final isCompleted = index < _currentStepIndex;
        final isCurrent = index == _currentStepIndex;
        final isPending = index > _currentStepIndex;

        return _buildTimelineStep(
          context,
          isDark,
          isBangla,
          step,
          index,
          isCompleted,
          isCurrent,
          isPending,
        );
      },
    );
  }

  Widget _buildTimelineStep(
    BuildContext context,
    bool isDark,
    bool isBangla,
    Map<String, dynamic> step,
    int index,
    bool isCompleted,
    bool isCurrent,
    bool isPending,
  ) {
    final isLast = index == _trackingSteps.length - 1;

    Color getStepColor() {
      if (isCompleted) return AppColors.success;
      if (isCurrent) return AppColors.primary;
      return isDark ? AppColors.textMutedDark : AppColors.textMutedLight;
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Timeline indicator
        Column(
          children: [
            // Step icon
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              width: isCurrent ? 48 : 40,
              height: isCurrent ? 48 : 40,
              decoration: BoxDecoration(
                color: isCurrent
                    ? AppColors.primary
                    : (isCompleted
                        ? AppColors.success.withValues(alpha: 0.15)
                        : (isDark
                            ? AppColors.surfaceDark
                            : AppColors.surfaceLight)),
                shape: BoxShape.circle,
                border: Border.all(
                  color: getStepColor(),
                  width: isCurrent ? 3 : 2,
                ),
                boxShadow: isCurrent
                    ? [
                        BoxShadow(
                          color: AppColors.primary.withValues(alpha: 0.4),
                          blurRadius: 12,
                          spreadRadius: 2,
                        ),
                      ]
                    : null,
              ),
              child: Icon(
                isCompleted ? Icons.check : step['icon'] as IconData,
                size: isCurrent ? 24 : 20,
                color: isCurrent
                    ? Colors.white
                    : (isCompleted ? AppColors.success : getStepColor()),
              ),
            ),
            // Connecting line
            if (!isLast)
              Container(
                width: 2,
                height: 60,
                margin: const EdgeInsets.symmetric(vertical: 4),
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      isCompleted
                          ? AppColors.success
                          : (isDark
                              ? AppColors.borderDark
                              : AppColors.borderLight),
                      index < _currentStepIndex - 1
                          ? AppColors.success
                          : (isDark
                              ? AppColors.borderDark
                              : AppColors.borderLight),
                    ],
                  ),
                ),
              ),
          ],
        ),

        const SizedBox(width: 16),

        // Step content
        Expanded(
          child: Container(
            margin: EdgeInsets.only(bottom: isLast ? 0 : 24),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: isCurrent
                  ? AppColors.primary.withValues(alpha: 0.08)
                  : (isDark ? AppColors.surfaceDark : AppColors.surfaceLight),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isCurrent
                    ? AppColors.primary.withValues(alpha: 0.3)
                    : (isDark ? AppColors.borderDark : AppColors.borderLight),
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        step['status'] as String,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight:
                              isCurrent ? FontWeight.bold : FontWeight.w600,
                          color: isCurrent
                              ? AppColors.primary
                              : (isCompleted
                                  ? (isDark
                                      ? AppColors.textMainDark
                                      : AppColors.textMainLight)
                                  : (isDark
                                      ? AppColors.textSubDark
                                      : AppColors.textSubLight)),
                        ),
                      ),
                    ),
                    if (isCurrent)
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Text(
                          isBangla ? 'বর্তমান' : 'Current',
                          style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    if (isCompleted)
                      const Icon(
                        Icons.check_circle,
                        size: 18,
                        color: AppColors.success,
                      ),
                  ],
                ),
                const SizedBox(height: 6),
                Text(
                  isBangla
                      ? (step['descriptionBn'] as String)
                      : (step['description'] as String),
                  style: TextStyle(
                    fontSize: 13,
                    color:
                        isDark ? AppColors.textSubDark : AppColors.textSubLight,
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildActionButtons(BuildContext context, bool isDark, bool isBangla) {
    return Container(
      padding: EdgeInsets.fromLTRB(
          24, 16, 24, MediaQuery.of(context).padding.bottom + 16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        border: Border(
          top: BorderSide(
            color: isDark ? AppColors.borderDark : AppColors.borderLight,
          ),
        ),
      ),
      child: Row(
        children: [
          // Call Support button
          Expanded(
            child: OutlinedButton.icon(
              onPressed: () async {
                final Uri phoneUri = Uri(scheme: 'tel', path: '+8801701330033');
                if (await canLaunchUrl(phoneUri)) {
                  await launchUrl(phoneUri);
                }
                if (context.mounted) Navigator.pop(context);
              },
              icon: const Icon(Icons.phone_outlined),
              label: Text(isBangla ? 'সাপোর্ট' : 'Call Support'),
              style: OutlinedButton.styleFrom(
                padding: const EdgeInsets.symmetric(vertical: 14),
                side: BorderSide(
                  color: isDark ? AppColors.borderDark : AppColors.borderLight,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
          const SizedBox(width: 12),
          // View Details button
          Expanded(
            child: ElevatedButton.icon(
              onPressed: () {
                Navigator.pop(context);
                Navigator.pushNamed(context, '/history');
              },
              icon: const Icon(Icons.visibility_outlined),
              label: Text(isBangla ? 'বিস্তারিত' : 'View Details'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.black,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
