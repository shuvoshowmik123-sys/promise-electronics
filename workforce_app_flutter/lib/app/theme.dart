import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // ═══════════════════════════════════════════
  // PRIMARY PALETTE — Native Blue + Clean White
  // ═══════════════════════════════════════════
  static const Color primary = Color(0xFFFFFFFF);         // Pure white
  static const Color primaryLight = Color(0xFFFFFFFF);     // Pure white
  static const Color primaryMid = Color(0xFFF8FAFC);       // Very light slate
  static const Color accent = Color(0xFF2563EB);           // Native Blue (primary actions)
  static const Color accentGlow = Color(0xFF3B82F6);       // Lighter blue for glow/hover
  static const Color accentSoft = Color(0x262563EB);       // 15% opacity for backgrounds

  // ═══════════════════════════════════════════
  // SEMANTIC COLORS
  // ═══════════════════════════════════════════
  static const Color success = Color(0xFF16A34A);          // Green — completed, on-site
  static const Color warning = Color(0xFFD97706);          // Amber — in progress, caution
  static const Color danger = Color(0xFFDC2626);           // Red — urgent, overdue
  static const Color info = Color(0xFF0284C7);             // Ocean Blue — informational
  static const Color neutral = Color(0xFF64748B);          // Slate gray — disabled, secondary text
  static const Color surface = Color(0xFFFFFFFF);          // Card backgrounds
  static const Color surfaceElevated = Color(0xFFFFFFFF);  // Pure white card backgrounds
  static const Color divider = Color(0xFFE2E8F0);          // Subtle dividers
  static const Color border = Color(0xFFE2E8F0);           // Shared alias
  static const Color surfaceLight = Color(0xFFFFFFFF);     // Shared alias

  // ═══════════════════════════════════════════
  // TEXT COLORS
  // ═══════════════════════════════════════════
  static const Color textPrimary = Color(0xFF0F172A);      // Slate 900 — headings
  static const Color textSecondary = Color(0xFF475569);    // Slate 600 — body text
  static const Color textTertiary = Color(0xFF94A3B8);     // Slate 400 — captions, timestamps
  static const Color textOnAccent = Color(0xFFFFFFFF);     // Pure white — text on blue buttons

  // ═══════════════════════════════════════════
  // SUB-CATEGORIES
  // ═══════════════════════════════════════════
  static const Map<String, Color> statusColors = {
    'Pending': Color(0xFFD97706),        // Amber 600
    'In Progress': Color(0xFF0284C7),    // Light Blue 600
    'Ready': Color(0xFF16A34A),          // Green 600
    'Completed': Color(0xFF059669),      // Emerald 600
    'Cancelled': Color(0xFF64748B),      // Slate 500
    'Parts Pending': Color(0xFFEA580C),  // Orange 600
    'Urgent': Color(0xFFDC2626),         // Red 600
  };

  // ═══════════════════════════════════════════
  // TYPOGRAPHY SCALE
  // ═══════════════════════════════════════════
  
  // HEADINGS (Outfit)
  static TextStyle h1 = GoogleFonts.outfit(
    fontSize: 28, fontWeight: FontWeight.w600, color: textPrimary, letterSpacing: -0.5,
  );
  static TextStyle h2 = GoogleFonts.outfit(
    fontSize: 22, fontWeight: FontWeight.w600, color: textPrimary, letterSpacing: -0.3,
  );
  static TextStyle h3 = GoogleFonts.outfit(
    fontSize: 18, fontWeight: FontWeight.w500, color: textPrimary,
  );
  static TextStyle h4 = GoogleFonts.outfit(
    fontSize: 16, fontWeight: FontWeight.w500, color: textPrimary,
  );

  // BODY TEXT (Inter)
  static TextStyle bodyLarge = GoogleFonts.inter(
    fontSize: 16, fontWeight: FontWeight.w400, color: textSecondary, height: 1.5,
  );
  static TextStyle bodyMedium = GoogleFonts.inter(
    fontSize: 14, fontWeight: FontWeight.w400, color: textSecondary, height: 1.4,
  );
  static TextStyle bodySmall = GoogleFonts.inter(
    fontSize: 12, fontWeight: FontWeight.w400, color: textTertiary, height: 1.3,
  );

  // LABELS (Inter)
  static TextStyle labelLarge = GoogleFonts.inter(
    fontSize: 16, fontWeight: FontWeight.w600, color: textOnAccent,
  );
  static TextStyle labelMedium = GoogleFonts.inter(
    fontSize: 14, fontWeight: FontWeight.w500, color: textPrimary,
  );
  static TextStyle labelSmall = GoogleFonts.inter(
    fontSize: 11, fontWeight: FontWeight.w600, color: textTertiary, letterSpacing: 0.5,
  );

  // STATS (Outfit)
  static TextStyle statLarge = GoogleFonts.outfit(
    fontSize: 36, fontWeight: FontWeight.w700, color: textPrimary,
  );
  static TextStyle statMedium = GoogleFonts.outfit(
    fontSize: 24, fontWeight: FontWeight.w600, color: textPrimary,
  );

  // Get the complete ThemeData
  static ThemeData get themeData {
    return ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: primary,
      primaryColor: primary,
      colorScheme: const ColorScheme.light(
        primary: accent,
        secondary: accentGlow,
        surface: surface,
        error: danger,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        iconTheme: IconThemeData(color: textPrimary),
      ),
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: primaryLight,
        selectedItemColor: accent,
        unselectedItemColor: textTertiary,
        type: BottomNavigationBarType.fixed,
        elevation: 10,
      ),
      textTheme: GoogleFonts.interTextTheme(ThemeData.light().textTheme),
    );
  }
}

class AppSpacing {
  static const double xs = 4.0;
  static const double sm = 8.0;
  static const double md = 12.0;
  static const double base = 16.0;
  static const double lg = 20.0;
  static const double xl = 24.0;
  static const double xxl = 32.0;
  static const double xxxl = 48.0;
  static const double screenHorizontal = 20.0;
  static const double screenVertical = 16.0;

  static const EdgeInsets screen = EdgeInsets.symmetric(horizontal: 20, vertical: 16);
  static const EdgeInsets cardInner = EdgeInsets.all(16);
  static const EdgeInsets cardInnerLarge = EdgeInsets.all(20);

  static const double cardGap = 12.0;
  static const double sectionGap = 24.0;
}

class AppRadius {
  static const double sm = 8.0;
  static const double md = 12.0;
  static const double button = 12.0;
  static const double lg = 16.0;
  static const double card = 16.0;
  static const double xl = 20.0;
  static const double full = 100.0;
}

class AppShadows {
  static List<BoxShadow> soft = [];
  static List<BoxShadow> elevated = [];
  static List<BoxShadow> glow(Color color) => [];
}
