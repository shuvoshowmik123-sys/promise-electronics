import 'package:flutter/material.dart';
import '../../services/lens_service.dart';
import '../../config/app_theme.dart';

/// Custom painter for drawing annotation overlays on camera view
/// Draws bounding box around detected problem and pointer line to annotation chip
class LensAnnotationPainter extends CustomPainter {
  final BoundingBox? boundingBox;
  final Offset? annotationPosition;
  final double animationProgress; // 0.0 to 1.0

  LensAnnotationPainter({
    this.boundingBox,
    this.annotationPosition,
    this.animationProgress = 1.0,
  });

  @override
  void paint(Canvas canvas, Size size) {
    if (boundingBox == null) return;

    // Convert relative coordinates to absolute
    final boxRect = Rect.fromLTWH(
      boundingBox!.x * size.width,
      boundingBox!.y * size.height,
      boundingBox!.width * size.width,
      boundingBox!.height * size.height,
    );

    // Draw bounding box
    _drawBoundingBox(canvas, boxRect);

    // Draw pointer line if annotation position is provided
    if (annotationPosition != null && animationProgress > 0.3) {
      _drawPointerLine(canvas, boxRect, annotationPosition!, size);
    }
  }

  void _drawBoundingBox(Canvas canvas, Rect rect) {
    final progress = (animationProgress * 3).clamp(0.0, 1.0);

    // Outer glow
    final glowPaint = Paint()
      ..color = AppColors.primary.withValues(alpha: 0.3 * progress)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8);

    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, const Radius.circular(12)),
      glowPaint,
    );

    // Dashed border (simplified as solid for performance)
    final borderPaint = Paint()
      ..color = AppColors.primary.withValues(alpha: 0.6 * progress)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;

    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, const Radius.circular(12)),
      borderPaint,
    );

    // Corner accents
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

    // Start from center-right of bounding box
    final startPoint = Offset(
      boxRect.right,
      boxRect.center.dy,
    );

    // End at left side of annotation chip
    final endPoint = Offset(
      targetOffset.dx,
      targetOffset.dy,
    );

    // Create a curved path
    final path = Path();
    path.moveTo(startPoint.dx, startPoint.dy);

    // Control point for bezier curve
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

    // Animate the path
    final pathMetrics = path.computeMetrics().first;
    final extractPath =
        pathMetrics.extractPath(0, pathMetrics.length * lineProgress);

    // Draw glow
    final glowPaint = Paint()
      ..color = AppColors.primary.withValues(alpha: 0.4)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 6
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);

    canvas.drawPath(extractPath, glowPaint);

    // Draw line
    final linePaint = Paint()
      ..color = AppColors.primary
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round;

    canvas.drawPath(extractPath, linePaint);

    // Draw endpoint dot
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
