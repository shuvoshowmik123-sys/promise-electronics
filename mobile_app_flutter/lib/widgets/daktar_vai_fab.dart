import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Floating Action Button for Daktar Vai AI
/// Always visible on screen for quick access to AI assistant
class DaktarVaiFab extends StatefulWidget {
  const DaktarVaiFab({super.key});

  @override
  State<DaktarVaiFab> createState() => _DaktarVaiFabState();
}

class _DaktarVaiFabState extends State<DaktarVaiFab> with SingleTickerProviderStateMixin {
  late AnimationController _controller;
  bool _isExpanded = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 200),
      vsync: this,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onTap() {
    HapticFeedback.mediumImpact();
    Navigator.of(context).pushNamed('/chat');
  }

  void _onLongPress() {
    HapticFeedback.heavyImpact();
    setState(() {
      _isExpanded = !_isExpanded;
      if (_isExpanded) {
        _controller.forward();
      } else {
        _controller.reverse();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.bottomCenter,
      children: [
        // Expanded options (shown on long press)
        if (_isExpanded) ...[
          Positioned(
            bottom: 80,
            child: _buildQuickOption(
              icon: Icons.camera_alt_outlined,
              label: 'Scan TV',
              color: const Color(0xFF3b82f6),
              delay: 0,
              onTap: () {
                // Open camera
                setState(() => _isExpanded = false);
                _controller.reverse();
              },
            ),
          ),
          Positioned(
            bottom: 140,
            child: _buildQuickOption(
              icon: Icons.mic_outlined,
              label: 'Voice',
              color: const Color(0xFFa855f7),
              delay: 50,
              onTap: () {
                // Start voice input
                Navigator.of(context).pushNamed('/chat');
                setState(() => _isExpanded = false);
                _controller.reverse();
              },
            ),
          ),
        ],

        // Main FAB
        GestureDetector(
          onTap: _onTap,
          onLongPress: _onLongPress,
          child: AnimatedBuilder(
            animation: _controller,
            builder: (context, child) {
              return Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(0xFF006a4e),
                      Color(0xFF36e27b),
                    ],
                  ),
                  shape: BoxShape.circle,
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF36e27b).withValues(alpha: 0.4),
                      blurRadius: 20,
                      spreadRadius: 2,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    // Pulsing ring
                    AnimatedBuilder(
                      animation: _controller,
                      builder: (context, child) {
                        return Container(
                          width: 64 + (8 * _controller.value),
                          height: 64 + (8 * _controller.value),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: const Color(0xFF36e27b).withValues(alpha: 0.3 - (0.3 * _controller.value)),
                              width: 2,
                            ),
                          ),
                        );
                      },
                    ),
                    // Icon
                    Transform.rotate(
                      angle: _controller.value * 0.5,
                      child: Icon(
                        _isExpanded ? Icons.close : Icons.smart_toy_rounded,
                        color: Colors.white,
                        size: 30,
                      ),
                    ),
                  ],
                ),
              );
            },
          ),
        )
            .animate(onPlay: (controller) => controller.repeat(reverse: true))
            .scale(
              begin: const Offset(1, 1),
              end: const Offset(1.05, 1.05),
              duration: 1500.ms,
              curve: Curves.easeInOut,
            ),
      ],
    );
  }

  Widget _buildQuickOption({
    required IconData icon,
    required String label,
    required Color color,
    required int delay,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        onTap();
      },
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: const Color(0xFF1e293b),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: const Color(0xFF334155)),
            ),
            child: Text(
              label,
              style: const TextStyle(
                color: Colors.white,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.15),
              shape: BoxShape.circle,
              border: Border.all(color: color.withValues(alpha: 0.3)),
            ),
            child: Icon(
              icon,
              color: color,
              size: 24,
            ),
          ),
        ],
      ),
    )
        .animate()
        .fadeIn(delay: Duration(milliseconds: delay), duration: 200.ms)
        .slideY(begin: 0.3, end: 0, delay: Duration(milliseconds: delay), duration: 200.ms, curve: Curves.easeOutBack);
  }
}
