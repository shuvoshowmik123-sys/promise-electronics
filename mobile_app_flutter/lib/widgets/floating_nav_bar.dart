import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../providers/locale_provider.dart';
import '../config/app_theme.dart';

/// Navigation item data
class NavItem {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final String route;
  final bool isCenter;

  const NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.route,
    this.isCenter = false,
  });
}

/// Floating glassmorphism navigation bar with 5 items
/// Features a prominent center button (like the design reference)
class FloatingNavBar extends StatelessWidget {
  final int currentIndex;
  final Function(int)? onTap;

  const FloatingNavBar({
    super.key,
    required this.currentIndex,
    this.onTap,
  });

  static const List<NavItem> items = [
    NavItem(
      icon: Icons.home_outlined,
      activeIcon: Icons.home_rounded,
      label: 'Home',
      route: '/home',
    ),
    NavItem(
      icon: Icons.build_outlined,
      activeIcon: Icons.build_rounded,
      label: 'Repair',
      route: '/repair-request',
    ),
    NavItem(
      icon: Icons.camera_alt_outlined,
      activeIcon: Icons.camera_alt_rounded,
      label: 'Lens',
      route: '/lens',
      isCenter: true,
    ),
    NavItem(
      icon: Icons.shopping_bag_outlined,
      activeIcon: Icons.shopping_bag_rounded,
      label: 'Shop',
      route: '/shop',
    ),
    NavItem(
      icon: Icons.person_outline,
      activeIcon: Icons.person_rounded,
      label: 'Profile',
      route: '/profile',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isBangla = Provider.of<LocaleProvider>(context).isBangla;

    final translatedItems = [
      NavItem(
        icon: Icons.home_outlined,
        activeIcon: Icons.home_rounded,
        label: isBangla ? 'হোম' : 'Home',
        route: '/home',
      ),
      NavItem(
        icon: Icons.build_outlined,
        activeIcon: Icons.build_rounded,
        label: isBangla ? 'মেরামত' : 'Repair',
        route: '/repair-request',
      ),
      NavItem(
        icon: Icons.camera_alt_outlined,
        activeIcon: Icons.camera_alt_rounded,
        label: isBangla ? 'লেন্স' : 'Lens',
        route: '/lens',
        isCenter: true,
      ),
      NavItem(
        icon: Icons.shopping_bag_outlined,
        activeIcon: Icons.shopping_bag_rounded,
        label: isBangla ? 'শপ' : 'Shop',
        route: '/shop',
      ),
      NavItem(
        icon: Icons.person_outline,
        activeIcon: Icons.person_rounded,
        label: isBangla ? 'প্রোফাইল' : 'Profile',
        route: '/profile',
      ),
    ];

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 20),
      height: 80,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: isDark
                    ? [
                        AppColors.surfaceDark.withValues(alpha: 0.9),
                        AppColors.surfaceDark.withValues(alpha: 0.8),
                      ]
                    : [
                        Colors.white.withValues(alpha: 0.75),
                        Colors.white.withValues(alpha: 0.65),
                      ],
              ),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(
                color: isDark
                    ? Colors.white.withValues(alpha: 0.12)
                    : Colors.white.withValues(alpha: 0.5),
                width: 1.5,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.15),
                  blurRadius: 30,
                  offset: const Offset(0, 10),
                  spreadRadius: -5,
                ),
                if (!isDark)
                  BoxShadow(
                    color: Colors.white.withValues(alpha: 0.8),
                    blurRadius: 10,
                    offset: const Offset(0, -2),
                  ),
              ],
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: List.generate(translatedItems.length, (index) {
                final item = translatedItems[index];
                if (item.isCenter) {
                  return _buildCenterButton(context, index, isDark, item);
                }
                return _buildNavItem(context, index, isDark, item);
              }),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildNavItem(
      BuildContext context, int index, bool isDark, NavItem item) {
    final isActive = currentIndex == index;

    return GestureDetector(
      onTap: () {
        HapticFeedback.lightImpact();
        if (onTap != null) {
          onTap!(index);
        } else if (!isActive) {
          Navigator.pushNamed(context, item.route);
        }
      },
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 200),
        curve: Curves.easeOutCubic,
        width: 56,
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Icon with animated scale
            AnimatedScale(
              scale: isActive ? 1.15 : 1.0,
              duration: const Duration(milliseconds: 200),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 200),
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: isActive
                      ? AppColors.primary.withValues(alpha: 0.15)
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  isActive ? item.activeIcon : item.icon,
                  size: 24,
                  color: isActive
                      ? AppColors.primary
                      : (isDark
                          ? AppColors.textMutedDark
                          : AppColors.textMutedLight),
                ),
              ),
            ),

            const SizedBox(height: 4),

            // Label
            AnimatedDefaultTextStyle(
              duration: const Duration(milliseconds: 200),
              style: TextStyle(
                fontSize: 10,
                fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                color: isActive
                    ? AppColors.primary
                    : (isDark
                        ? AppColors.textMutedDark
                        : AppColors.textMutedLight),
              ),
              child: Text(item.label),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildCenterButton(
      BuildContext context, int index, bool isDark, NavItem item) {
    final isActive = currentIndex == index;

    return GestureDetector(
      onTap: () {
        HapticFeedback.mediumImpact();
        if (onTap != null) {
          onTap!(index);
        } else if (!isActive) {
          Navigator.pushNamed(context, item.route);
        }
      },
      child: Container(
        width: 64,
        height: 64,
        margin: const EdgeInsets.only(bottom: 8),
        child: Stack(
          alignment: Alignment.center,
          children: [
            // Outer glow
            Container(
              width: 56,
              height: 56,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary
                        .withValues(alpha: isActive ? 0.5 : 0.3),
                    blurRadius: isActive ? 20 : 12,
                    spreadRadius: isActive ? 2 : 0,
                  ),
                ],
              ),
            ),
            // Main button
            AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              width: isActive ? 56 : 52,
              height: isActive ? 56 : 52,
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [
                    AppColors.primary,
                    AppColors.primary.withValues(alpha: 0.85),
                  ],
                ),
                shape: BoxShape.circle,
                border: Border.all(
                  color: Colors.white.withValues(alpha: 0.3),
                  width: 2,
                ),
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.4),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Icon(
                isActive ? item.activeIcon : item.icon,
                size: 28,
                color: Colors.white,
              ),
            )
                .animate(
                  onPlay: (controller) => isActive
                      ? controller.repeat(reverse: true)
                      : controller.stop(),
                )
                .scale(
                  begin: const Offset(1.0, 1.0),
                  end: const Offset(1.05, 1.05),
                  duration: 1500.ms,
                  curve: Curves.easeInOut,
                ),
          ],
        ),
      ),
    );
  }
}

/// Wrapper widget that adds the floating nav bar to a screen
class ScreenWithNavBar extends StatelessWidget {
  final Widget child;
  final int currentIndex;

  const ScreenWithNavBar({
    super.key,
    required this.child,
    required this.currentIndex,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      extendBody: true,
      bottomNavigationBar: FloatingNavBar(currentIndex: currentIndex),
    );
  }
}
