import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../providers/app_settings_provider.dart';
import '../providers/locale_provider.dart';
import '../providers/shuvo_mode_provider.dart';
import '../utils/app_animations.dart';

/// "System Boot" Splash Screen
/// Implements the 2025 "Cold Boot" animation strategy.
class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});

  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initialize();
    });
  }

  Future<void> _initialize() async {
    // Start initialization tasks
    final authFuture = _checkAuth();
    final settingsFuture = _loadSettings();

    // Ensure animation has time to play (min 2.5 seconds for full effect)
    final animationMinTime = Future.delayed(const Duration(milliseconds: 2500));

    await Future.wait([authFuture, settingsFuture, animationMinTime]);

    _navigateToNextScreen();
  }

  Future<void> _checkAuth() async {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    await auth.initialize();
  }

  Future<void> _loadSettings() async {
    final settings = Provider.of<AppSettingsProvider>(context, listen: false);
    await settings.fetchSettings();
  }

  void _navigateToNextScreen() {
    if (!mounted) return;

    final auth = Provider.of<AuthProvider>(context, listen: false);
    final settings = Provider.of<AppSettingsProvider>(context, listen: false);

    if (settings.maintenanceMode) {
      Navigator.of(context).pushReplacementNamed('/home');
      return;
    }

    if (auth.isAuthenticated) {
      Navigator.of(context).pushReplacementNamed('/home');
    } else {
      Navigator.of(context).pushReplacementNamed('/login');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isBangla = Provider.of<LocaleProvider>(context).isBangla;

    return Scaffold(
      backgroundColor: const Color(0xFF0f172a), // Deep dark blue/slate
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Stage 1 & 2: Logo Power On (with secret Shuvo Mode activation)
            GestureDetector(
              onTap: () {
                final message =
                    context.read<ShuvoModeProvider>().handleActivationTap();
                if (message != null) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(message),
                      duration: const Duration(seconds: 2),
                      backgroundColor: message.contains('Activated')
                          ? const Color(0xFF36e27b)
                          : Colors.orange,
                    ),
                  );
                }
              },
              child: Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      Color(0xFF006a4e), // Bangladesh green
                      Color(0xFF36e27b), // Bright green
                    ],
                  ),
                  borderRadius: BorderRadius.circular(30),
                  boxShadow: [
                    BoxShadow(
                      color: const Color(0xFF36e27b).withOpacity(0.5),
                      blurRadius: 30,
                      spreadRadius: 2,
                    ),
                  ],
                  border: Border.all(
                    color: Colors.white.withOpacity(0.2),
                    width: 1,
                  ),
                ),
                child: const Icon(
                  Icons.tv,
                  size: 60,
                  color: Colors.white,
                ),
              ),
            )
                .animate()
                // Stage 1: Circuit Trace / Power Surge (Scale + Shimmer)
                .scale(
                  duration: 600.ms,
                  curve: AppAnimations.precisionCurve,
                  begin: const Offset(0.8, 0.8),
                  end: const Offset(1, 1),
                )
                .shimmer(
                  duration: 1200.ms,
                  color: Colors.white.withOpacity(0.8),
                  angle: 0.5,
                )
                // Stage 2: Glow Pulse
                .boxShadow(
                  begin: BoxShadow(
                    color: const Color(0xFF36e27b).withOpacity(0),
                    blurRadius: 0,
                    spreadRadius: 0,
                  ),
                  end: BoxShadow(
                    color: const Color(0xFF36e27b).withOpacity(0.5),
                    blurRadius: 30,
                    spreadRadius: 5,
                  ),
                  duration: 800.ms,
                  curve: Curves.easeOut,
                ),

            const SizedBox(height: 40),

            // Stage 3: Typewriter Text
            SizedBox(
              height: 50, // Fixed height to prevent layout shift
              child: const Text(
                'TV ডাক্তার',
                style: TextStyle(
                  fontSize: 36,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  letterSpacing: -0.5,
                  fontFamily: 'Inter', // Ensure premium font if available
                ),
              )
                  .animate()
                  .fadeIn(duration: 300.ms, delay: 400.ms)
                  // Typewriter effect simulation using mask/clip or just slide
                  .slideX(
                    begin: -0.1,
                    end: 0,
                    duration: 400.ms,
                    curve: AppAnimations.precisionCurve,
                  )
                  .shimmer(
                    duration: 1500.ms,
                    delay: 800.ms,
                    color: const Color(0xFF36e27b),
                  ),
            ),

            const SizedBox(height: 8),

            // Tagline
            Text(
              isBangla ? 'আপনার টিভির সেরা বন্ধু' : 'Your TV\'s Best Friend',
              style: TextStyle(
                fontSize: 16,
                color: Colors.white.withOpacity(0.6),
                letterSpacing: 0.5,
              ),
            )
                .animate()
                .fadeIn(delay: 1000.ms, duration: 600.ms)
                .slideY(begin: 0.2, end: 0, curve: Curves.easeOut),

            const SizedBox(height: 60),

            // System Status (Digital Cursor style)
            Consumer<AuthProvider>(
              builder: (context, auth, child) {
                String statusText = isBangla
                    ? 'সিস্টেম লোড হচ্ছে...'
                    : 'System Initializing...';
                if (auth.state == AuthState.checking) {
                  statusText = isBangla
                      ? 'নিরাপত্তা যাচাই করা হচ্ছে...'
                      : 'Verifying Security Protocols...';
                }

                return Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    border:
                        Border.all(color: Colors.white.withOpacity(0.1)),
                    borderRadius: BorderRadius.circular(4),
                    color: Colors.black.withOpacity(0.2),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6,
                        height: 6,
                        decoration: const BoxDecoration(
                          color: Color(0xFF36e27b),
                          shape: BoxShape.circle,
                        ),
                      )
                          .animate(onPlay: (c) => c.repeat(reverse: true))
                          .fadeIn(duration: 500.ms)
                          .fadeOut(duration: 500.ms),
                      const SizedBox(width: 8),
                      Text(
                        statusText,
                        style: TextStyle(
                          fontSize: 12,
                          color: const Color(0xFF36e27b).withOpacity(0.8),
                          fontFamily: 'Courier', // Monospace for tech feel
                          letterSpacing: 1,
                        ),
                      ),
                    ],
                  ),
                ).animate().fadeIn(delay: 1200.ms);
              },
            ),
          ],
        ),
      ),
    );
  }
}
