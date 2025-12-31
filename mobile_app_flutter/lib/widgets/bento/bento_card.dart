import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// A glassmorphic card widget for the Bento Grid layout.
/// Supports different sizes and interactive animations.
class BentoCard extends StatefulWidget {
  final Widget child;
  final int columnSpan;
  final int rowSpan;
  final VoidCallback? onTap;
  final Color? backgroundColor;
  final Gradient? gradient;
  final bool showGlow;
  final EdgeInsets? padding;

  const BentoCard({
    super.key,
    required this.child,
    this.columnSpan = 1,
    this.rowSpan = 1,
    this.onTap,
    this.backgroundColor,
    this.gradient,
    this.showGlow = false,
    this.padding,
  });

  @override
  State<BentoCard> createState() => _BentoCardState();
}

class _BentoCardState extends State<BentoCard>
    with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  bool _isPressed = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 150),
      vsync: this,
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.97).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTapDown(TapDownDetails details) {
    if (widget.onTap != null) {
      setState(() => _isPressed = true);
      _controller.forward();
      HapticFeedback.lightImpact();
    }
  }

  void _onTapUp(TapUpDetails details) {
    if (widget.onTap != null) {
      setState(() => _isPressed = false);
      _controller.reverse();
    }
  }

  void _onTapCancel() {
    if (widget.onTap != null) {
      setState(() => _isPressed = false);
      _controller.reverse();
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final defaultBg = widget.backgroundColor ?? const Color(0xFF1e293b);

    return ListenableBuilder(
      listenable: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: _scaleAnimation.value,
          child: child,
        );
      },
      child: GestureDetector(
        onTapDown: _onTapDown,
        onTapUp: _onTapUp,
        onTapCancel: _onTapCancel,
        onTap: widget.onTap,
        child: Container(
          decoration: BoxDecoration(
            gradient: widget.gradient,
            color: widget.gradient == null ? defaultBg.withValues(alpha: 0.7) : null,
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: _isPressed
                  ? theme.colorScheme.secondary.withValues(alpha: 0.5)
                  : Colors.white.withValues(alpha: 0.08),
              width: _isPressed ? 1.5 : 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.3),
                blurRadius: 32,
                offset: const Offset(0, 8),
              ),
              if (widget.showGlow)
                BoxShadow(
                  color: theme.colorScheme.secondary.withValues(alpha: 0.15),
                  blurRadius: 24,
                  spreadRadius: 0,
                ),
            ],
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(20),
            child: BackdropFilter(
              filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
              child: Padding(
                padding: widget.padding ?? const EdgeInsets.all(16),
                child: widget.child,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
