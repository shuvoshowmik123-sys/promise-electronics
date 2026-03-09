import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

class OpusAnimations {
  // Duration tokens
  static const Duration fast = Duration(milliseconds: 150);
  static const Duration normal = Duration(milliseconds: 280);
  static const Duration slow = Duration(milliseconds: 450);
  static const Duration stagger = Duration(milliseconds: 60);

  // Curve tokens
  static const Curve spring = Curves.fastOutSlowIn; // Close representation of a spring curve
  static const Curve smooth = Cubic(0.4, 0.0, 0.2, 1.0);
  static const Curve snappy = Cubic(0.175, 0.885, 0.32, 1.275); // Bouncy out
  static const Curve bounce = Curves.bounceOut;

  // Screen transitions (Fade + Slide)
  static Route createRoute(Widget page) {
    return PageRouteBuilder(
      pageBuilder: (context, animation, secondaryAnimation) => page,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        var begin = const Offset(0.0, 0.05); // Start slightly lower
        var end = Offset.zero;
        var curveTween = CurveTween(curve: smooth);

        var slideAnimation = animation.drive(Tween(begin: begin, end: end).chain(curveTween));
        var fadeAnimation = animation.drive(Tween(begin: 0.0, end: 1.0).chain(curveTween));

        return FadeTransition(
          opacity: fadeAnimation,
          child: SlideTransition(
            position: slideAnimation,
            child: child,
          ),
        );
      },
      transitionDuration: normal,
    );
  }

  // GoRouter specific transition
  static CustomTransitionPage buildPageTransition({
    required BuildContext context,
    required GoRouterState state,
    required Widget child,
  }) {
    return CustomTransitionPage(
      key: state.pageKey,
      child: child,
      transitionDuration: normal,
      transitionsBuilder: (context, animation, secondaryAnimation, child) {
        var begin = const Offset(0.0, 0.05);
        var end = Offset.zero;
        var curveTween = CurveTween(curve: smooth);

        var slideAnimation = animation.drive(Tween(begin: begin, end: end).chain(curveTween));
        var fadeAnimation = animation.drive(Tween(begin: 0.0, end: 1.0).chain(curveTween));

        return FadeTransition(
          opacity: fadeAnimation,
          child: SlideTransition(
            position: slideAnimation,
            child: child,
          ),
        );
      },
    );
  }
}
