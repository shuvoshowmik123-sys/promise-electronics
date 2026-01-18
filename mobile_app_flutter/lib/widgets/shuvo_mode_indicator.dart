import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../providers/shuvo_mode_provider.dart';
import '../screens/shuvo_mode_screen.dart';

/// Shuvo Mode Indicator Widget
///
/// A floating badge that appears when Shuvo Mode is active.
/// Shows a pulsing "SHUVO MODE" badge in the top-right corner.
/// Tapping it opens the diagnostic screen.
class ShuvoModeIndicator extends StatelessWidget {
  const ShuvoModeIndicator({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<ShuvoModeProvider>(
      builder: (context, provider, _) {
        if (!provider.isEnabled) {
          return const SizedBox.shrink();
        }

        return Positioned(
          top: MediaQuery.of(context).padding.top + 8,
          right: 8,
          child: GestureDetector(
            onTap: () {
              Navigator.push(
                context,
                MaterialPageRoute(builder: (_) => const ShuvoModeScreen()),
              );
            },
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFFF5722), Color(0xFFE91E63)],
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFFFF5722).withValues(alpha: 0.4),
                    blurRadius: 12,
                    spreadRadius: 2,
                  ),
                ],
              ),
              child: const Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.developer_mode,
                    size: 14,
                    color: Colors.white,
                  ),
                  SizedBox(width: 4),
                  Text(
                    'SHUVO',
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.bold,
                      fontSize: 10,
                      color: Colors.white,
                      letterSpacing: 1,
                    ),
                  ),
                ],
              ),
            )
                .animate(
                    onPlay: (controller) => controller.repeat(reverse: true))
                .scale(
                  begin: const Offset(1, 1),
                  end: const Offset(1.05, 1.05),
                  duration: 800.ms,
                )
                .shimmer(duration: 1500.ms, color: Colors.white30),
          ),
        );
      },
    );
  }
}

/// A wrapper widget that adds the Shuvo Mode indicator to any screen
class WithShuvoModeIndicator extends StatelessWidget {
  final Widget child;

  const WithShuvoModeIndicator({
    super.key,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        child,
        const ShuvoModeIndicator(),
      ],
    );
  }
}
