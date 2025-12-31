import 'dart:ui';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';

import '../config/app_theme.dart';
import '../providers/theme_provider.dart';
import '../providers/locale_provider.dart';
import '../widgets/floating_nav_bar.dart';
import 'edit_profile_screen.dart';
import 'my_warranties_screen.dart';
import 'login_screen.dart';
import 'contact_us_screen.dart';
import 'privacy_policy_screen.dart';
import 'terms_and_conditions_screen.dart';

/// Profile Screen with theme toggle
/// Edge-to-edge hero design with floating back button
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isAuthenticated = context.watch<AuthProvider>().isAuthenticated;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      extendBody: true,
      extendBodyBehindAppBar: true,
      body: Stack(
        children: [
          // Main Content
          SingleChildScrollView(
            physics: const BouncingScrollPhysics(),
            child: Column(
              children: [
                // Hero Section
                _buildHeroSection(context, isDark, isAuthenticated),

                // Menu Sections
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const SizedBox(height: 8),

                      // Account Section
                      _buildSectionTitle(
                          context,
                          isDark,
                          _getTranslatedString(
                              context, 'ACCOUNT', 'অ্যাকাউন্ট')),
                      const SizedBox(height: 12),
                      _buildMenuItem(
                        context,
                        isDark,
                        icon: Icons.verified_user_outlined,
                        title: _getTranslatedString(
                            context, 'My Warranty', 'আমার ওয়ারেন্টি'),
                        isEnabled: isAuthenticated,
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (context) =>
                                    const MyWarrantiesScreen()),
                          );
                        },
                      ),
                      const SizedBox(height: 12),
                      _buildMenuItem(
                        context,
                        isDark,
                        icon: Icons.location_on_outlined,
                        title: _getTranslatedString(
                            context, 'Saved Addresses', 'সংরক্ষিত ঠিকানা'),
                        isEnabled: isAuthenticated,
                        onTap: () {
                          Navigator.pushNamed(context, '/saved-addresses');
                        },
                      ),
                      const SizedBox(height: 12),
                      _buildMenuItem(
                        context,
                        isDark,
                        icon: Icons.notifications_outlined,
                        title: _getTranslatedString(
                            context, 'Notifications', 'নোটিফিকেশন'),
                        isEnabled: isAuthenticated,
                        onTap: () {},
                      ),
                      const SizedBox(height: 12),
                      _buildMenuItem(
                        context,
                        isDark,
                        icon: Icons.language,
                        title:
                            _getTranslatedString(context, 'Language', 'ভাষা'),
                        subtitle: _getLanguageLabel(context),
                        onTap: () => _showLanguageSelector(context),
                      ),
                      const SizedBox(height: 12),
                      _buildMenuItem(
                        context,
                        isDark,
                        icon: Icons.palette_outlined,
                        title:
                            _getTranslatedString(context, 'Appearance', 'থিম'),
                        subtitle: _getThemeModeLabel(context),
                        onTap: () => _showThemeSelector(context),
                      ),

                      const SizedBox(height: 32),

                      // Support Section
                      _buildSectionTitle(context, isDark,
                          _getTranslatedString(context, 'SUPPORT', 'সাপোর্ট')),
                      const SizedBox(height: 12),
                      _buildMenuItem(
                        context,
                        isDark,
                        icon: Icons.description_outlined,
                        title: _getTranslatedString(
                            context, 'Terms & Conditions', 'শর্তাবলী'),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (context) =>
                                    const TermsAndConditionsScreen()),
                          );
                        },
                      ),
                      const SizedBox(height: 12),
                      _buildMenuItem(
                        context,
                        isDark,
                        icon: Icons.call_outlined,
                        title: _getTranslatedString(
                            context, 'Contact Us', 'যোগাযোগ করুন'),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (context) => const ContactUsScreen()),
                          );
                        },
                      ),
                      const SizedBox(height: 12),
                      _buildMenuItem(
                        context,
                        isDark,
                        icon: Icons.lock_outline,
                        title: _getTranslatedString(
                            context, 'Privacy Policy', 'গোপনীয়তা নীতি'),
                        onTap: () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                                builder: (context) =>
                                    const PrivacyPolicyScreen()),
                          );
                        },
                      ),

                      const SizedBox(height: 40),

                      // Logout Button
                      if (isAuthenticated) _buildLogoutButton(context, isDark),

                      const SizedBox(height: 16),

                      // Version
                      Center(
                        child: Text(
                          'v2.4.0 • TV Repair Services',
                          style: TextStyle(
                            fontSize: 10,
                            color: isDark
                                ? AppColors.textMutedDark
                                : AppColors.textMutedLight,
                          ),
                        ),
                      ),

                      const SizedBox(height: 120),
                    ],
                  ),
                ),
              ],
            ),
          ),

          // Floating Back Button
          Positioned(
            top: MediaQuery.of(context).padding.top + 12,
            left: 20,
            child: _buildFloatingBackButton(context, isDark),
          ),
        ],
      ),
      bottomNavigationBar: const FloatingNavBar(currentIndex: 4),
    );
  }

// ... (existing code)

  Widget _buildHeroSection(
      BuildContext context, bool isDark, bool isAuthenticated) {
    final user = context.watch<AuthProvider>().user;
    final name = isAuthenticated ? (user?.name ?? 'User') : 'Guest';
    final subtitle = isAuthenticated
        ? (user?.phone ?? user?.email ?? '')
        : (Provider.of<LocaleProvider>(context).isBangla
            ? 'আপনার প্রোফাইল দেখতে লগ ইন করুন'
            : 'Please log in to view your profile');
    final avatarUrl = isAuthenticated
        ? (user?.avatar)
        : 'https://ui-avatars.com/api/?name=Guest&background=36e27b&color=fff&bold=true&size=200';

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: isDark
              ? [AppColors.backgroundDark, AppColors.backgroundDark]
              : [
                  AppColors.mintWashLight,
                  AppColors.mintWashLight.withValues(alpha: 0.5),
                  AppColors.backgroundLight
                ],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(24, 60, 24, 40),
          child: Column(
            children: [
              // Avatar
              Container(
                width: 100,
                height: 100,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 4),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.15),
                      blurRadius: 20,
                    ),
                  ],
                ),
                child: ClipOval(
                  child: _buildAvatarImage(avatarUrl, name),
                ),
              ),
              const SizedBox(height: 20),

              // Name
              Text(
                name,
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  letterSpacing: -0.5,
                  color:
                      isDark ? AppColors.textMainDark : AppColors.textMainLight,
                ),
              ),
              const SizedBox(height: 4),

              // Email/Phone/Subtitle
              Text(
                subtitle,
                style: const TextStyle(
                  fontSize: 15,
                  color: AppColors.primary,
                ),
              ),
              const SizedBox(height: 24),

              // Edit Profile / Login Button
              ElevatedButton(
                onPressed: () {
                  if (isAuthenticated) {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (context) => const EditProfileScreen()),
                    );
                  } else {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                          builder: (context) =>
                              const LoginScreen(fromProfile: true)),
                    );
                  }
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 32, vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(30),
                  ),
                  elevation: 4,
                  shadowColor: AppColors.primary.withValues(alpha: 0.4),
                ),
                child: Text(
                  isAuthenticated
                      ? _getTranslatedString(
                          context, 'Edit Profile', 'প্রোফাইল এডিট করুন')
                      : _getTranslatedString(context, 'Log In', 'লগ ইন'),
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAvatarImage(String? avatarUrl, String name) {
    if (avatarUrl == null) {
      return Image.network(
        'https://ui-avatars.com/api/?name=${Uri.encodeComponent(name)}&background=36e27b&color=fff&bold=true&size=200',
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => Container(
          color: Colors.grey[300],
          child: const Icon(Icons.person, size: 50),
        ),
      );
    }

    if (kIsWeb) {
      return Image.network(
        avatarUrl,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildAvatarImage(null, name),
      );
    }

    if (avatarUrl.startsWith('http')) {
      return Image.network(
        avatarUrl,
        fit: BoxFit.cover,
        errorBuilder: (_, __, ___) => _buildAvatarImage(null, name),
      );
    }

    return Image.file(
      File(avatarUrl),
      fit: BoxFit.cover,
      errorBuilder: (_, __, ___) => _buildAvatarImage(null, name),
    );
  }

  Widget _buildFloatingBackButton(BuildContext context, bool isDark) {
    return GestureDetector(
      onTap: () => Navigator.pop(context),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(50),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: isDark
                  ? Colors.black.withValues(alpha: 0.3)
                  : Colors.white.withValues(alpha: 0.6),
              shape: BoxShape.circle,
              border: Border.all(
                color: isDark
                    ? Colors.white.withValues(alpha: 0.1)
                    : Colors.white.withValues(alpha: 0.4),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.1),
                  blurRadius: 8,
                ),
              ],
            ),
            child: Icon(
              Icons.arrow_back,
              size: 20,
              color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSectionTitle(BuildContext context, bool isDark, String title) {
    return Padding(
      padding: const EdgeInsets.only(left: 16),
      child: Text(
        title,
        style: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.2,
          color: isDark ? AppColors.textMutedDark : AppColors.textMutedLight,
        ),
      ),
    );
  }

// ... (existing code)

  Widget _buildMenuItem(
    BuildContext context,
    bool isDark, {
    required IconData icon,
    required String title,
    String? subtitle,
    required VoidCallback onTap,
    bool isEnabled = true,
  }) {
    return GestureDetector(
      onTap: isEnabled ? onTap : null,
      child: Opacity(
        opacity: isEnabled ? 1.0 : 0.5,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
          decoration: BoxDecoration(
            color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: isDark ? AppColors.borderDark : AppColors.cardBorderLight,
              width: 1,
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.03),
                blurRadius: 8,
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: isDark
                      ? AppColors.primary.withValues(alpha: 0.2)
                      : const Color(0xFFe8f3ec),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(
                  icon,
                  size: 22,
                  color: isDark ? AppColors.primary : AppColors.textMainLight,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w500,
                        color: isDark
                            ? AppColors.textMainDark
                            : AppColors.textMainLight,
                      ),
                    ),
                    if (subtitle != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.primary,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right,
                color: isDark ? AppColors.borderDark : AppColors.textMutedLight,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLogoutButton(BuildContext context, bool isDark) {
    return GestureDetector(
      onTap: () async {
        final auth = Provider.of<AuthProvider>(context, listen: false);
        await auth.logout();
        if (context.mounted) {
          Navigator.of(context)
              .pushNamedAndRemoveUntil('/home', (route) => false);
        }
      },
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
          borderRadius: BorderRadius.circular(30),
          border: Border.all(
            color: AppColors.coralRed.withValues(alpha: 0.2),
          ),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.logout,
              color: AppColors.coralRed,
              size: 20,
            ),
            const SizedBox(width: 8),
            Text(
              _getTranslatedString(context, 'Log Out', 'লগ আউট'),
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: AppColors.coralRed,
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _getThemeModeLabel(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context);
    switch (themeProvider.themeMode) {
      case ThemeMode.light:
        return 'Light';
      case ThemeMode.dark:
        return 'Dark';
      case ThemeMode.system:
        return 'System';
    }
  }

  void _showThemeSelector(BuildContext context) {
    final themeProvider = Provider.of<ThemeProvider>(context, listen: false);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Appearance',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color:
                    isDark ? AppColors.textMainDark : AppColors.textMainLight,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Choose your preferred theme',
              style: TextStyle(
                fontSize: 14,
                color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
              ),
            ),
            const SizedBox(height: 24),

            // Theme Options
            _buildThemeOption(
              context,
              isDark,
              themeProvider,
              icon: Icons.light_mode_outlined,
              title: 'Light',
              mode: ThemeMode.light,
            ),
            const SizedBox(height: 12),
            _buildThemeOption(
              context,
              isDark,
              themeProvider,
              icon: Icons.dark_mode_outlined,
              title: 'Dark',
              mode: ThemeMode.dark,
            ),
            const SizedBox(height: 12),
            _buildThemeOption(
              context,
              isDark,
              themeProvider,
              icon: Icons.settings_suggest_outlined,
              title: 'System',
              subtitle: 'Follows device setting',
              mode: ThemeMode.system,
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom + 16),
          ],
        ),
      ),
    );
  }

  Widget _buildThemeOption(
    BuildContext context,
    bool isDark,
    ThemeProvider themeProvider, {
    required IconData icon,
    required String title,
    String? subtitle,
    required ThemeMode mode,
  }) {
    final isSelected = themeProvider.themeMode == mode;

    return GestureDetector(
      onTap: () {
        // Add haptic feedback
        themeProvider.setThemeMode(mode);
        // Delay closing to show animation
        Future.delayed(const Duration(milliseconds: 200), () {
          if (context.mounted) {
            Navigator.pop(context);
          }
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withValues(alpha: 0.15)
              : (isDark ? AppColors.backgroundDark : AppColors.backgroundLight),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected
                ? AppColors.primary
                : (isDark ? AppColors.borderDark : AppColors.borderLight),
            width: isSelected ? 2 : 1,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.2),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ]
              : null,
        ),
        child: Row(
          children: [
            // Animated icon container
            AnimatedContainer(
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOutBack,
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: isSelected
                    ? AppColors.primary.withValues(alpha: 0.2)
                    : (isDark
                        ? AppColors.surfaceDark
                        : AppColors.backgroundLight),
                borderRadius: BorderRadius.circular(10),
              ),
              child: AnimatedScale(
                scale: isSelected ? 1.05 : 1.0,
                duration: const Duration(milliseconds: 200),
                child: Icon(
                  icon,
                  size: 20,
                  color: isSelected
                      ? AppColors.primary
                      : (isDark
                          ? AppColors.textSubDark
                          : AppColors.textSubLight),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight:
                          isSelected ? FontWeight.w700 : FontWeight.w600,
                      color: isSelected
                          ? AppColors.primary
                          : (isDark
                              ? AppColors.textMainDark
                              : AppColors.textMainLight),
                    ),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark
                            ? AppColors.textSubDark
                            : AppColors.textSubLight,
                      ),
                    ),
                ],
              ),
            ),
            // Animated checkmark
            AnimatedScale(
              scale: isSelected ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 250),
              curve: Curves.easeOutBack,
              child: AnimatedOpacity(
                opacity: isSelected ? 1.0 : 0.0,
                duration: const Duration(milliseconds: 200),
                child: Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: AppColors.primary,
                    shape: BoxShape.circle,
                    boxShadow: [
                      BoxShadow(
                        color: AppColors.primary.withValues(alpha: 0.3),
                        blurRadius: 6,
                      ),
                    ],
                  ),
                  child: const Icon(
                    Icons.check,
                    size: 14,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // --- Language Helpers ---

  String _getTranslatedString(BuildContext context, String en, String bn) {
    final localeProvider = Provider.of<LocaleProvider>(context);
    return localeProvider.isBangla ? bn : en;
  }

  String _getLanguageLabel(BuildContext context) {
    final localeProvider = Provider.of<LocaleProvider>(context);
    return localeProvider.isBangla ? 'বাংলা' : 'English';
  }

  void _showLanguageSelector(BuildContext context) {
    final localeProvider = Provider.of<LocaleProvider>(context, listen: false);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        padding: const EdgeInsets.all(24),
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              _getTranslatedString(context, 'Language', 'ভাষা'),
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.bold,
                color:
                    isDark ? AppColors.textMainDark : AppColors.textMainLight,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              _getTranslatedString(context, 'Choose your preferred language',
                  'আপনার পছন্দের ভাষা নির্বাচন করুন'),
              style: TextStyle(
                fontSize: 14,
                color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
              ),
            ),
            const SizedBox(height: 24),

            // Language Options
            _buildLanguageOption(
              context,
              isDark,
              localeProvider,
              title: 'English',
              subtitle: 'English',
              localeCode: 'en',
            ),
            const SizedBox(height: 12),
            _buildLanguageOption(
              context,
              isDark,
              localeProvider,
              title: 'বাংলা',
              subtitle: 'Bengali',
              localeCode: 'bn',
            ),
            SizedBox(height: MediaQuery.of(context).padding.bottom + 16),
          ],
        ),
      ),
    );
  }

  Widget _buildLanguageOption(
    BuildContext context,
    bool isDark,
    LocaleProvider localeProvider, {
    required String title,
    String? subtitle,
    required String localeCode,
  }) {
    final isSelected = localeProvider.locale == localeCode;

    return GestureDetector(
      onTap: () {
        localeProvider.setLocale(localeCode);
        Future.delayed(const Duration(milliseconds: 200), () {
          if (context.mounted) {
            Navigator.pop(context);
          }
        });
      },
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOutCubic,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withValues(alpha: 0.15)
              : (isDark ? AppColors.backgroundDark : AppColors.backgroundLight),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected
                ? AppColors.primary
                : (isDark ? AppColors.borderDark : AppColors.borderLight),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: isSelected
                    ? AppColors.primary.withValues(alpha: 0.2)
                    : (isDark
                        ? AppColors.surfaceDark
                        : AppColors.backgroundLight),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Center(
                child: Text(
                  localeCode.toUpperCase(),
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 12,
                    color: isSelected
                        ? AppColors.primary
                        : (isDark
                            ? AppColors.textSubDark
                            : AppColors.textSubLight),
                  ),
                ),
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight:
                          isSelected ? FontWeight.w700 : FontWeight.w600,
                      color: isSelected
                          ? AppColors.primary
                          : (isDark
                              ? AppColors.textMainDark
                              : AppColors.textMainLight),
                    ),
                  ),
                  if (subtitle != null)
                    Text(
                      subtitle,
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark
                            ? AppColors.textSubDark
                            : AppColors.textSubLight,
                      ),
                    ),
                ],
              ),
            ),
            if (isSelected)
              Container(
                width: 24,
                height: 24,
                decoration: const BoxDecoration(
                  color: AppColors.primary,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check,
                  size: 14,
                  color: Colors.white,
                ),
              ),
          ],
        ),
      ),
    );
  }
}
