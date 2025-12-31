import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../config/app_theme.dart';

/// A utility class for handling authentication guards in navigation
class AuthGuard {
  /// Check if user is authenticated, show login prompt if not
  /// Returns true if authenticated, false if user cancelled
  static Future<bool> checkAuth(
    BuildContext context, {
    String? featureName,
    String? returnRoute,
  }) async {
    final authProvider = Provider.of<AuthProvider>(context, listen: false);

    if (authProvider.isAuthenticated) {
      return true;
    }

    // Show login prompt modal
    final result = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _LoginPromptSheet(
        featureName: featureName,
        returnRoute: returnRoute,
      ),
    );

    return result ?? false;
  }

  /// Navigate to a route with auth guard
  /// Shows login prompt if not authenticated
  static Future<void> navigateWithAuth(
    BuildContext context,
    String route, {
    String? featureName,
  }) async {
    final isAuthenticated = await checkAuth(
      context,
      featureName: featureName,
      returnRoute: route,
    );

    if (isAuthenticated && context.mounted) {
      Navigator.pushNamed(context, route);
    }
  }
}

class _LoginPromptSheet extends StatelessWidget {
  final String? featureName;
  final String? returnRoute;

  const _LoginPromptSheet({
    this.featureName,
    this.returnRoute,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isBangla = Provider.of<LocaleProvider>(context).isBangla;

    return Container(
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle bar
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: isDark ? AppColors.borderDark : AppColors.borderLight,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 32),

              // Icon
              Container(
                width: 80,
                height: 80,
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.lock_outline_rounded,
                  size: 40,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 24),

              // Title
              Text(
                isBangla ? 'সাইন ইন করুন' : 'Sign In Required',
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  color:
                      isDark ? AppColors.textMainDark : AppColors.textMainLight,
                ),
              ),
              const SizedBox(height: 12),

              // Description
              Text(
                isBangla
                    ? 'আপনার মেরামত ট্র্যাক করতে অনুগ্রহ করে সাইন ইন করুন'
                    : 'Please sign in to ${featureName ?? 'access this feature'}',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 14,
                  color:
                      isDark ? AppColors.textSubDark : AppColors.textSubLight,
                  height: 1.5,
                ),
              ),
              const SizedBox(height: 32),

              // Sign In Button
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: () {
                    HapticFeedback.mediumImpact();
                    Navigator.pop(context); // Close the modal
                    Navigator.pushNamed(
                      context,
                      '/login',
                      arguments: {'returnRoute': returnRoute},
                    ).then((result) {
                      // If login was successful and we have a return route,
                      // the login screen should handle navigation
                    });
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      const Icon(Icons.login, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        isBangla ? 'সাইন ইন করুন' : 'Sign In',
                        style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Cancel Button
              TextButton(
                onPressed: () {
                  HapticFeedback.lightImpact();
                  Navigator.pop(context, false);
                },
                child: Text(
                  isBangla ? 'বাতিল করুন' : 'Cancel',
                  style: TextStyle(
                    fontSize: 14,
                    color: isDark
                        ? AppColors.textMutedDark
                        : AppColors.textMutedLight,
                  ),
                ),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}
