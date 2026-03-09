import 'package:flutter/material.dart';
import '../../core/animations.dart';

class OpusButton extends StatefulWidget {
  final Widget child;
  final VoidCallback? onPressed;
  final double scaleDown;

  const OpusButton({
    super.key,
    required this.child,
    this.onPressed,
    this.scaleDown = 0.96,
  });

  @override
  State<OpusButton> createState() => _OpusButtonState();
}

class _OpusButtonState extends State<OpusButton> {
  bool _isPressed = false;

  void _handleTapDown(TapDownDetails details) {
    if (widget.onPressed != null) {
      setState(() => _isPressed = true);
    }
  }

  void _handleTapUp(TapUpDetails details) {
    if (widget.onPressed != null) {
      setState(() => _isPressed = false);
      widget.onPressed!();
    }
  }

  void _handleTapCancel() {
    setState(() => _isPressed = false);
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTapDown: _handleTapDown,
      onTapUp: _handleTapUp,
      onTapCancel: _handleTapCancel,
      behavior: HitTestBehavior.opaque,
      child: AnimatedScale(
        scale: _isPressed ? widget.scaleDown : 1.0,
        duration: OpusAnimations.fast,
        curve: OpusAnimations.snappy,
        child: AbsorbPointer(
          absorbing: true, // Prevents inner buttons from stealing the gesture
          child: widget.child,
        ),
      ),
    );
  }
}
