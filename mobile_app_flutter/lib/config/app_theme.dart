import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// App color constants for light and dark themes
class AppColors {
  // Primary brand color (same for both themes)
  static const Color primary = Color(0xFF36e27b);
  static const Color primaryDark = Color(0xFF2cc768);

  // Light mode colors
  static const Color backgroundLight = Color(0xFFf6f8f7);
  static const Color surfaceLight = Color(0xFFffffff);
  static const Color mintWashLight = Color(0xFFE8F5E9);
  static const Color textMainLight = Color(0xFF0e1b13);
  static const Color textSubLight = Color(0xFF5f7a6c);
  static const Color textMutedLight = Color(0xFF94a3b8);
  static const Color borderLight = Color(0xFFe2e8f0);
  static const Color cardBorderLight = Color(0xFFf1f5f9);

  // Dark mode colors
  static const Color backgroundDark = Color(0xFF112117);
  static const Color surfaceDark = Color(0xFF1e2e24);
  static const Color mintWashDark = Color(0xFF1a3324);
  static const Color textMainDark = Color(0xFFffffff);
  static const Color textSubDark = Color(0xFF94a3b8);
  static const Color textMutedDark = Color(0xFF64748b);
  static const Color borderDark = Color(0xFF334155);
  static const Color cardBorderDark = Color(0xFF2d3f35);

  // Accent colors (same for both themes)
  static const Color coralRed = Color(0xFFFF5252);
  static const Color warning = Color(0xFFf59e0b);
  static const Color success = Color(0xFF10b981);
  static const Color error = coralRed;

  // Chat bubble colors
  static const Color chatUserBubble = primary;
  static const Color chatAiBubbleLight = Color(0xFFf9fafb);
  static const Color chatAiBubbleDark = Color(0xFF1e2e24);
}

/// App theme definitions
class AppTheme {
  /// Light theme
  static ThemeData lightTheme() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      primaryColor: AppColors.primary,
      scaffoldBackgroundColor: AppColors.backgroundLight,

      // Color scheme
      colorScheme: const ColorScheme.light(
        primary: AppColors.primary,
        secondary: AppColors.primary,
        surface: AppColors.surfaceLight,
        error: AppColors.coralRed,
        onPrimary: AppColors.textMainLight,
        onSecondary: AppColors.textMainLight,
        onSurface: AppColors.textMainLight,
      ),

      // App bar theme
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.textMainLight,
        ),
        iconTheme: const IconThemeData(color: AppColors.textMainLight),
      ),

      // Card theme
      cardTheme: CardThemeData(
        color: AppColors.surfaceLight,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.cardBorderLight, width: 1),
        ),
      ),

      // Text theme
      textTheme: GoogleFonts.interTextTheme(
        const TextTheme(
          displayLarge: TextStyle(
              color: AppColors.textMainLight, fontWeight: FontWeight.bold),
          displayMedium: TextStyle(
              color: AppColors.textMainLight, fontWeight: FontWeight.bold),
          displaySmall: TextStyle(
              color: AppColors.textMainLight, fontWeight: FontWeight.bold),
          headlineLarge: TextStyle(
              color: AppColors.textMainLight, fontWeight: FontWeight.bold),
          headlineMedium: TextStyle(
              color: AppColors.textMainLight, fontWeight: FontWeight.w600),
          headlineSmall: TextStyle(
              color: AppColors.textMainLight, fontWeight: FontWeight.w600),
          titleLarge: TextStyle(
              color: AppColors.textMainLight, fontWeight: FontWeight.w600),
          titleMedium: TextStyle(
              color: AppColors.textMainLight, fontWeight: FontWeight.w500),
          titleSmall: TextStyle(
              color: AppColors.textSubLight, fontWeight: FontWeight.w500),
          bodyLarge: TextStyle(color: AppColors.textMainLight),
          bodyMedium: TextStyle(color: AppColors.textSubLight),
          bodySmall: TextStyle(color: AppColors.textMutedLight),
          labelLarge: TextStyle(
              color: AppColors.textMainLight, fontWeight: FontWeight.w600),
          labelMedium: TextStyle(color: AppColors.textSubLight),
          labelSmall: TextStyle(color: AppColors.textMutedLight),
        ),
      ),

      // Input decoration theme
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        hintStyle: const TextStyle(color: AppColors.textMutedLight),
      ),

      // Elevated button theme
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.textMainLight,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(30),
          ),
          textStyle: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),

      // Floating action button theme
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.textMainLight,
        elevation: 8,
        shape: CircleBorder(),
      ),

      // Bottom navigation bar theme
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surfaceLight,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textMutedLight,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),

      // Divider theme
      dividerTheme: const DividerThemeData(
        color: AppColors.borderLight,
        thickness: 1,
      ),
    );
  }

  /// Dark theme
  static ThemeData darkTheme() {
    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      primaryColor: AppColors.primary,
      scaffoldBackgroundColor: AppColors.backgroundDark,

      // Color scheme
      colorScheme: const ColorScheme.dark(
        primary: AppColors.primary,
        secondary: AppColors.primary,
        surface: AppColors.surfaceDark,
        error: AppColors.coralRed,
        onPrimary: AppColors.textMainLight,
        onSecondary: AppColors.textMainLight,
        onSurface: AppColors.textMainDark,
      ),

      // App bar theme
      appBarTheme: AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: true,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: AppColors.textMainDark,
        ),
        iconTheme: const IconThemeData(color: AppColors.textMainDark),
      ),

      // Card theme
      cardTheme: CardThemeData(
        color: AppColors.surfaceDark,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: AppColors.cardBorderDark, width: 1),
        ),
      ),

      // Text theme
      textTheme: GoogleFonts.interTextTheme(
        const TextTheme(
          displayLarge: TextStyle(
              color: AppColors.textMainDark, fontWeight: FontWeight.bold),
          displayMedium: TextStyle(
              color: AppColors.textMainDark, fontWeight: FontWeight.bold),
          displaySmall: TextStyle(
              color: AppColors.textMainDark, fontWeight: FontWeight.bold),
          headlineLarge: TextStyle(
              color: AppColors.textMainDark, fontWeight: FontWeight.bold),
          headlineMedium: TextStyle(
              color: AppColors.textMainDark, fontWeight: FontWeight.w600),
          headlineSmall: TextStyle(
              color: AppColors.textMainDark, fontWeight: FontWeight.w600),
          titleLarge: TextStyle(
              color: AppColors.textMainDark, fontWeight: FontWeight.w600),
          titleMedium: TextStyle(
              color: AppColors.textMainDark, fontWeight: FontWeight.w500),
          titleSmall: TextStyle(
              color: AppColors.textSubDark, fontWeight: FontWeight.w500),
          bodyLarge: TextStyle(color: AppColors.textMainDark),
          bodyMedium: TextStyle(color: AppColors.textSubDark),
          bodySmall: TextStyle(color: AppColors.textMutedDark),
          labelLarge: TextStyle(
              color: AppColors.textMainDark, fontWeight: FontWeight.w600),
          labelMedium: TextStyle(color: AppColors.textSubDark),
          labelSmall: TextStyle(color: AppColors.textMutedDark),
        ),
      ),

      // Input decoration theme
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: AppColors.surfaceDark,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        hintStyle: const TextStyle(color: AppColors.textMutedDark),
      ),

      // Elevated button theme
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: AppColors.textMainLight,
          elevation: 0,
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(30),
          ),
          textStyle: GoogleFonts.inter(
            fontSize: 16,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),

      // Floating action button theme
      floatingActionButtonTheme: const FloatingActionButtonThemeData(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.textMainLight,
        elevation: 8,
        shape: CircleBorder(),
      ),

      // Bottom navigation bar theme
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: AppColors.surfaceDark,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textMutedDark,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),

      // Divider theme
      dividerTheme: const DividerThemeData(
        color: AppColors.borderDark,
        thickness: 1,
      ),
    );
  }
}
