import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

/// Centralized animation constants and utilities for TV Daktar
/// Implements the "Precision Flow" motion system.
class AppAnimations {
  // Durations
  static const Duration micro = Duration(milliseconds: 200);
  static const Duration standard = Duration(milliseconds: 300);
  static const Duration complex = Duration(milliseconds: 500);
  static const Duration splash = Duration(milliseconds: 1200);

  // Curves
  static const Curve precisionCurve = Curves.easeOutQuart;
  static const Curve bounceCurve = Curves.elasticOut;
  static const Curve exitCurve = Curves.easeIn;

  // Pre-configured Effects
  static List<Effect> get entranceFadeScale => [
        const FadeEffect(duration: standard, curve: precisionCurve),
        const ScaleEffect(
          begin: Offset(0.95, 0.95),
          end: Offset(1, 1),
          duration: standard,
          curve: precisionCurve,
        ),
      ];

  static List<Effect> get listItemEntrance => [
        const FadeEffect(duration: micro, curve: precisionCurve),
        const SlideEffect(
          begin: Offset(0, 0.1),
          end: Offset.zero,
          duration: micro,
          curve: precisionCurve,
        ),
      ];
}
