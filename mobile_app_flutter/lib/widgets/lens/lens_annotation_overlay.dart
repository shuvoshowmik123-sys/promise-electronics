import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../../services/lens_service.dart';
import '../../config/app_theme.dart';

/// Enhanced annotation overlay that shows an arrow pointing to the problem
/// with a label describing the issue
class ProblemAnnotationOverlay extends StatefulWidget {
  final BoundingBox? boundingBox;
  final String? labelEn;
  final String? labelBn;
  final String? issueType;
  final String? severity;
  final double? confidence;
  final bool isVisible;
  final bool isBangla;

  const ProblemAnnotationOverlay({
    super.key,
    this.boundingBox,
    this.labelEn,
    this.labelBn,
    this.issueType,
    this.severity,
    this.confidence,
    this.isVisible = false,
    this.isBangla = false,
  });

  @override
  State<ProblemAnnotationOverlay> createState() =>
      _ProblemAnnotationOverlayState();
}

class _ProblemAnnotationOverlayState extends State<ProblemAnnotationOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _fadeAnimation;
  late Animation<double> _scaleAnimation;
  late Animation<double> _arrowAnimation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 800),
      vsync: this,
    );

    _fadeAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
          parent: _controller,
          curve: const Interval(0.0, 0.5, curve: Curves.easeOut)),
    );

    _scaleAnimation = Tween<double>(begin: 0.8, end: 1.0).animate(
      CurvedAnimation(
          parent: _controller,
          curve: const Interval(0.0, 0.6, curve: Curves.easeOutBack)),
    );

    _arrowAnimation = Tween<double>(begin: 0.0, end: 1.0).animate(
      CurvedAnimation(
          parent: _controller,
          curve: const Interval(0.3, 1.0, curve: Curves.easeOut)),
    );
  }

  @override
  void didUpdateWidget(ProblemAnnotationOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isVisible && !oldWidget.isVisible) {
      _controller.forward(from: 0);
    } else if (!widget.isVisible && oldWidget.isVisible) {
      _controller.reverse();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Color _getSeverityColor() {
    switch (widget.severity?.toLowerCase() ?? widget.issueType?.toLowerCase()) {
      case 'critical':
      case 'severe':
      case 'high':
        return Colors.red;
      case 'moderate':
      case 'medium':
        return Colors.orange;
      case 'minor':
      case 'low':
        return AppColors.primary;
      default:
        return AppColors.primary;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.isVisible || widget.boundingBox == null) {
      return const SizedBox.shrink();
    }

    final size = MediaQuery.of(context).size;
    final box = widget.boundingBox!;

    // Calculate box position in screen coordinates
    final boxLeft = box.x * size.width;
    final boxTop = box.y * size.height;
    final boxWidth = box.width * size.width;
    final boxHeight = box.height * size.height;
    final boxCenterX = boxLeft + boxWidth / 2;
    final boxCenterY = boxTop + boxHeight / 2;

    // Position the label to the right of the bounding box
    final labelLeft = boxLeft + boxWidth + 20;
    final labelTop = boxCenterY - 50;

    final severityColor = _getSeverityColor();
    final label = widget.isBangla ? widget.labelBn : widget.labelEn;

    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Stack(
          children: [
            // Bounding box with pulsing effect
            Positioned(
              left: boxLeft,
              top: boxTop,
              child: Opacity(
                opacity: _fadeAnimation.value,
                child: Transform.scale(
                  scale: _scaleAnimation.value,
                  child: Container(
                    width: boxWidth,
                    height: boxHeight,
                    decoration: BoxDecoration(
                      border: Border.all(
                        color: severityColor.withOpacity(0.8),
                        width: 3,
                      ),
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [
                        BoxShadow(
                          color: severityColor.withOpacity(0.4),
                          blurRadius: 12,
                          spreadRadius: 2,
                        ),
                      ],
                    ),
                    child: Stack(
                      children: [
                        // Corner brackets
                        _buildCornerBracket(Alignment.topLeft, severityColor),
                        _buildCornerBracket(Alignment.topRight, severityColor),
                        _buildCornerBracket(
                            Alignment.bottomLeft, severityColor),
                        _buildCornerBracket(
                            Alignment.bottomRight, severityColor),
                      ],
                    ),
                  ),
                ),
              ),
            ),

            // Arrow and label
            if (_arrowAnimation.value > 0 && label != null)
              CustomPaint(
                size: size,
                painter: _ArrowPainter(
                  startX: boxLeft + boxWidth,
                  startY: boxCenterY,
                  endX: labelLeft - 10,
                  endY: labelTop + 25,
                  progress: _arrowAnimation.value,
                  color: severityColor,
                ),
              ),

            // Label card
            if (label != null)
              Positioned(
                left: labelLeft.clamp(20.0, size.width - 200),
                top: labelTop.clamp(100.0, size.height - 200),
                child: Opacity(
                  opacity: _arrowAnimation.value,
                  child: Transform.translate(
                    offset: Offset(20 * (1 - _arrowAnimation.value), 0),
                    child: _buildLabelCard(label, severityColor),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }

  Widget _buildCornerBracket(Alignment alignment, Color color) {
    final isTop =
        alignment == Alignment.topLeft || alignment == Alignment.topRight;
    final isLeft =
        alignment == Alignment.topLeft || alignment == Alignment.bottomLeft;

    return Positioned(
      top: isTop ? 0 : null,
      bottom: !isTop ? 0 : null,
      left: isLeft ? 0 : null,
      right: !isLeft ? 0 : null,
      child: Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(
          border: Border(
            top: isTop ? BorderSide(color: color, width: 4) : BorderSide.none,
            bottom:
                !isTop ? BorderSide(color: color, width: 4) : BorderSide.none,
            left: isLeft ? BorderSide(color: color, width: 4) : BorderSide.none,
            right:
                !isLeft ? BorderSide(color: color, width: 4) : BorderSide.none,
          ),
        ),
      ),
    );
  }

  Widget _buildLabelCard(String label, Color severityColor) {
    return Container(
      constraints: const BoxConstraints(maxWidth: 180),
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.85),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: severityColor.withOpacity(0.6), width: 2),
        boxShadow: [
          BoxShadow(
            color: severityColor.withOpacity(0.3),
            blurRadius: 16,
            spreadRadius: 2,
          ),
          BoxShadow(
            color: Colors.black.withOpacity(0.5),
            blurRadius: 8,
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          // Issue icon and type
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                _getIssueIcon(),
                color: severityColor,
                size: 18,
              ),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  widget.issueType ??
                      (widget.isBangla ? 'সমস্যা সনাক্ত' : 'Issue Detected'),
                  style: TextStyle(
                    color: severityColor,
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 0.5,
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),

          // Main label
          Text(
            label,
            style: const TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w600,
              height: 1.3,
            ),
          ),

          // Confidence score
          if (widget.confidence != null) ...[
            const SizedBox(height: 8),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 60,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.white.withOpacity(0.2),
                    borderRadius: BorderRadius.circular(2),
                  ),
                  child: FractionallySizedBox(
                    alignment: Alignment.centerLeft,
                    widthFactor: (widget.confidence! / 100).clamp(0.0, 1.0),
                    child: Container(
                      decoration: BoxDecoration(
                        color: severityColor,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '${widget.confidence!.toStringAsFixed(0)}%',
                  style: TextStyle(
                    color: Colors.white.withOpacity(0.7),
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    )
        .animate(
          onPlay: (controller) => controller.repeat(reverse: true),
        )
        .shimmer(
          duration: 2000.ms,
          color: severityColor.withOpacity(0.1),
        );
  }

  IconData _getIssueIcon() {
    switch (widget.issueType?.toLowerCase()) {
      case 'power':
      case 'electrical':
        return Icons.electric_bolt;
      case 'display':
      case 'screen':
        return Icons.tv;
      case 'audio':
      case 'sound':
        return Icons.volume_off;
      case 'physical':
      case 'damage':
        return Icons.broken_image;
      default:
        return Icons.warning_amber_rounded;
    }
  }
}

/// Custom painter for drawing the arrow from bounding box to label
class _ArrowPainter extends CustomPainter {
  final double startX;
  final double startY;
  final double endX;
  final double endY;
  final double progress;
  final Color color;

  _ArrowPainter({
    required this.startX,
    required this.startY,
    required this.endX,
    required this.endY,
    required this.progress,
    required this.color,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (progress <= 0) return;

    // Create curved path
    final path = Path();
    path.moveTo(startX, startY);

    // Control point for bezier curve
    final midX = (startX + endX) / 2;
    final controlY = startY - 30;

    path.quadraticBezierTo(midX, controlY, endX, endY);

    // Extract animated portion
    final pathMetrics = path.computeMetrics();
    if (pathMetrics.isEmpty) return;

    final metric = pathMetrics.first;
    final extractedPath = metric.extractPath(0, metric.length * progress);

    // Draw glow
    final glowPaint = Paint()
      ..color = color.withOpacity(0.4)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
    canvas.drawPath(extractedPath, glowPaint);

    // Draw line
    final linePaint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..strokeCap = StrokeCap.round;
    canvas.drawPath(extractedPath, linePaint);

    // Draw arrowhead at the end
    if (progress >= 1.0) {
      _drawArrowhead(canvas, endX, endY, color);
    }
  }

  void _drawArrowhead(Canvas canvas, double x, double y, Color color) {
    final arrowPaint = Paint()
      ..color = color
      ..style = PaintingStyle.fill;

    final path = Path();
    path.moveTo(x, y);
    path.lineTo(x - 8, y - 6);
    path.lineTo(x - 8, y + 6);
    path.close();

    canvas.drawPath(path, arrowPaint);
  }

  @override
  bool shouldRepaint(_ArrowPainter oldDelegate) {
    return oldDelegate.progress != progress ||
        oldDelegate.startX != startX ||
        oldDelegate.endX != endX;
  }
}

/// Legacy annotation overlay - keeping for backward compatibility
class LensAnnotationPainter extends CustomPainter {
  final BoundingBox? boundingBox;
  final Offset? annotationPosition;
  final double animationProgress;

  LensAnnotationPainter({
    this.boundingBox,
    this.annotationPosition,
    this.animationProgress = 1.0,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (boundingBox == null) return;

    final boxRect = Rect.fromLTWH(
      boundingBox!.x * size.width,
      boundingBox!.y * size.height,
      boundingBox!.width * size.width,
      boundingBox!.height * size.height,
    );

    _drawBoundingBox(canvas, boxRect);

    if (annotationPosition != null && animationProgress > 0.3) {
      _drawPointerLine(canvas, boxRect, annotationPosition!, size);
    }
  }

  void _drawBoundingBox(Canvas canvas, Rect rect) {
    final progress = (animationProgress * 3).clamp(0.0, 1.0);

    final glowPaint = Paint()
      ..color = AppColors.primary.withOpacity(0.3 * progress)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);

    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, const Radius.circular(12)),
      glowPaint,
    );

    final borderPaint = Paint()
      ..color = AppColors.primary.withOpacity(0.6 * progress)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, const Radius.circular(12)),
      borderPaint,
    );

    _drawCornerAccents(canvas, rect, progress);
  }

  void _drawCornerAccents(Canvas canvas, Rect rect, double progress) {
    final cornerLength = 20.0 * progress;
    final cornerPaint = Paint()
      ..color = AppColors.primary
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round;

    // Top-left
    canvas.drawLine(
      Offset(rect.left, rect.top + cornerLength),
      Offset(rect.left, rect.top),
      cornerPaint,
    );
    canvas.drawLine(
      Offset(rect.left, rect.top),
      Offset(rect.left + cornerLength, rect.top),
      cornerPaint,
    );

    // Top-right
    canvas.drawLine(
      Offset(rect.right - cornerLength, rect.top),
      Offset(rect.right, rect.top),
      cornerPaint,
    );
    canvas.drawLine(
      Offset(rect.right, rect.top),
      Offset(rect.right, rect.top + cornerLength),
      cornerPaint,
    );

    // Bottom-left
    canvas.drawLine(
      Offset(rect.left, rect.bottom - cornerLength),
      Offset(rect.left, rect.bottom),
      cornerPaint,
    );
    canvas.drawLine(
      Offset(rect.left, rect.bottom),
      Offset(rect.left + cornerLength, rect.bottom),
      cornerPaint,
    );

    // Bottom-right
    canvas.drawLine(
      Offset(rect.right - cornerLength, rect.bottom),
      Offset(rect.right, rect.bottom),
      cornerPaint,
    );
    canvas.drawLine(
      Offset(rect.right, rect.bottom),
      Offset(rect.right, rect.bottom - cornerLength),
      cornerPaint,
    );
  }

  void _drawPointerLine(
      Canvas canvas, Rect boxRect, Offset targetOffset, Size size) {
    final lineProgress = ((animationProgress - 0.3) / 0.4).clamp(0.0, 1.0);

    final startPoint = Offset(
      boxRect.right,
      boxRect.center.dy,
    );

    final endPoint = Offset(
      targetOffset.dx,
      targetOffset.dy,
    );

    final path = Path();
    path.moveTo(startPoint.dx, startPoint.dy);

    final controlPoint = Offset(
      (startPoint.dx + endPoint.dx) / 2 + 30,
      (startPoint.dy + endPoint.dy) / 2 - 20,
    );

    path.quadraticBezierTo(
      controlPoint.dx,
      controlPoint.dy,
      endPoint.dx,
      endPoint.dy,
    );

    final pathMetrics = path.computeMetrics().first;
    final extractPath =
        pathMetrics.extractPath(0, pathMetrics.length * lineProgress);

    final glowPaint = Paint()
      ..color = AppColors.primary.withOpacity(0.4)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);

    canvas.drawPath(extractPath, glowPaint);

    final linePaint = Paint()
      ..color = AppColors.primary
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;

    canvas.drawPath(extractPath, linePaint);

    if (lineProgress >= 1.0) {
      canvas.drawCircle(
        endPoint,
        4,
        Paint()..color = AppColors.primary,
      );
    }
  }

  @override
  bool shouldRepaint(LensAnnotationPainter oldDelegate) {
    return oldDelegate.boundingBox != boundingBox ||
        oldDelegate.annotationPosition != annotationPosition ||
        oldDelegate.animationProgress != animationProgress;
  }
}

/// Widget that wraps the annotation painter with animation
class LensAnnotationOverlay extends StatefulWidget {
  final BoundingBox? boundingBox;
  final Offset? annotationPosition;
  final bool isVisible;

  const LensAnnotationOverlay({
    super.key,
    this.boundingBox,
    this.annotationPosition,
    this.isVisible = false,
  });

  @override
  State<LensAnnotationOverlay> createState() => _LensAnnotationOverlayState();
}

class _LensAnnotationOverlayState extends State<LensAnnotationOverlay>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 1200),
      vsync: this,
    );
    _animation = CurvedAnimation(
      parent: _controller,
      curve: Curves.easeOutCubic,
    );
  }

  @override
  void didUpdateWidget(LensAnnotationOverlay oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.isVisible && !oldWidget.isVisible) {
      _controller.forward(from: 0);
    } else if (!widget.isVisible && oldWidget.isVisible) {
      _controller.reverse();
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _animation,
      builder: (context, child) {
        return CustomPaint(
          painter: LensAnnotationPainter(
            boundingBox: widget.boundingBox,
            annotationPosition: widget.annotationPosition,
            animationProgress: _animation.value,
          ),
          size: Size.infinite,
        );
      },
    );
  }
}
