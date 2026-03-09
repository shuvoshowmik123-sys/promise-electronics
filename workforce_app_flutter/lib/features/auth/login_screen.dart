import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../app/theme.dart';
import '../../core/auth/auth_provider.dart';
import '../../shared/widgets/glass_card.dart';
import '../../shared/widgets/opus_button.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> with TickerProviderStateMixin {
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  final _formKey = GlobalKey<FormState>();
  bool _obscurePassword = true;

  late final AnimationController _shakeController;
  late final Animation<double> _shakeAnimation;
  
  late final AnimationController _bgController;

  @override
  void initState() {
    super.initState();
    _shakeController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 300),
    );
    _shakeAnimation = Tween<double>(begin: 0, end: 8)
        .chain(CurveTween(curve: Curves.elasticIn))
        .animate(_shakeController);
        
    _bgController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 15),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _usernameController.dispose();
    _passwordController.dispose();
    _shakeController.dispose();
    _bgController.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;
    
    // Unfocus keyboard
    FocusManager.instance.primaryFocus?.unfocus();

    final success = await context.read<AuthProvider>().login(
      _usernameController.text.trim(),
      _passwordController.text,
    );

    if (!success && mounted) {
      _shakeController.forward(from: 0);
      HapticFeedback.mediumImpact();
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final isLoading = auth.status == AuthStatus.authenticating;
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: AppTheme.primary,
      body: Stack(
        children: [
          // Animated Background
          // Animated Network/Wave Background
          AnimatedBuilder(
            animation: _bgController,
            builder: (context, child) {
              return CustomPaint(
                painter: NetworkPainter(_bgController.value),
                size: Size.infinite,
              );
            },
          ),
          
          // Foreground Glass Dialog
          SafeArea(
            child: Center(
              child: SingleChildScrollView(
                physics: const ClampingScrollPhysics(),
                padding: EdgeInsets.symmetric(horizontal: AppSpacing.screen.horizontal, vertical: AppSpacing.md),
                child: AnimatedBuilder(
                  animation: _shakeAnimation,
                  builder: (context, child) {
                    return Transform.translate(
                      offset: Offset(
                        _shakeAnimation.value * 
                          (_shakeController.isAnimating ? (DateTime.now().millisecond % 2 == 0 ? 1 : -1) : 0), 
                        0
                      ),
                      child: child,
                    );
                  },
                  child: Container(
                    constraints: const BoxConstraints(maxWidth: 400),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        // Logo Section
                        Center(
                          child: Container(
                            padding: const EdgeInsets.all(AppSpacing.md),
                            decoration: BoxDecoration(
                              color: AppTheme.surfaceElevated.withOpacity(0.7),
                              shape: BoxShape.circle,
                              border: Border.all(color: AppTheme.accent.withOpacity(0.4), width: 1.5),
                              boxShadow: AppShadows.glow(AppTheme.accentSoft),
                            ),
                            child: const PromiseLogo(size: 64, color: AppTheme.accent),
                          ),
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Text(
                          'Promise Electronics',
                          textAlign: TextAlign.center,
                          style: AppTheme.h2.copyWith(color: AppTheme.textPrimary),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          'Sign in to your account',
                          textAlign: TextAlign.center,
                          style: AppTheme.bodyLarge.copyWith(color: AppTheme.textSecondary),
                        ),
                        const SizedBox(height: AppSpacing.xl),

                        GlassCard(
                          padding: const EdgeInsets.all(AppSpacing.lg),
                          borderColor: AppTheme.accent.withOpacity(0.4),
                          borderWidth: 1.5,
                          child: Form(
                            key: _formKey,
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                // Inputs Section
                            Container(
                              decoration: BoxDecoration(
                                color: AppTheme.surface.withOpacity(0.7),
                                borderRadius: BorderRadius.circular(AppRadius.md),
                                border: Border.all(color: AppTheme.divider),
                              ),
                              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: 4),
                              child: TextFormField(
                                controller: _usernameController,
                                style: AppTheme.bodyLarge.copyWith(color: AppTheme.textPrimary),
                                decoration: InputDecoration(
                                  hintText: 'Username',
                                  hintStyle: AppTheme.bodyLarge.copyWith(color: AppTheme.textTertiary),
                                  icon: Icon(Icons.person_outline, color: AppTheme.textTertiary),
                                  border: InputBorder.none,
                                  errorStyle: const TextStyle(height: 0),
                                ),
                                validator: (v) => v!.isEmpty ? '' : null,
                                textInputAction: TextInputAction.next,
                              ),
                            ),
                            const SizedBox(height: AppSpacing.lg),
                            
                            Container(
                              decoration: BoxDecoration(
                                color: AppTheme.surfaceElevated.withOpacity(0.5),
                                borderRadius: BorderRadius.circular(AppRadius.md),
                                border: Border.all(color: AppTheme.divider.withOpacity(0.3)),
                              ),
                              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.base, vertical: 4),
                              child: TextFormField(
                                controller: _passwordController,
                                obscureText: _obscurePassword,
                                style: AppTheme.bodyLarge.copyWith(color: AppTheme.textPrimary),
                                decoration: InputDecoration(
                                  hintText: 'Password',
                                  hintStyle: AppTheme.bodyLarge.copyWith(color: AppTheme.textTertiary),
                                  icon: Icon(Icons.lock_outline, color: AppTheme.textTertiary),
                                  border: InputBorder.none,
                                  errorStyle: const TextStyle(height: 0),
                                  suffixIcon: IconButton(
                                    icon: Icon(
                                      _obscurePassword ? Icons.visibility_off : Icons.visibility,
                                      color: AppTheme.textSecondary,
                                    ),
                                    onPressed: () => setState(() => _obscurePassword = !_obscurePassword),
                                  ),
                                ),
                                validator: (v) => v!.isEmpty ? '' : null,
                                onFieldSubmitted: (_) => _handleLogin(),
                              ),
                            ),
                            
                            if (auth.errorMessage != null) ...[
                              const SizedBox(height: AppSpacing.lg),
                              Container(
                                padding: const EdgeInsets.all(AppSpacing.sm),
                                decoration: BoxDecoration(
                                  color: AppTheme.danger.withOpacity(0.1),
                                  borderRadius: BorderRadius.circular(AppRadius.sm),
                                  border: Border.all(color: AppTheme.danger.withOpacity(0.3)),
                                ),
                                child: Row(
                                  children: [
                                    Icon(Icons.error_outline, color: AppTheme.danger, size: 20),
                                    const SizedBox(width: AppSpacing.sm),
                                    Expanded(
                                      child: Text(
                                        auth.errorMessage!,
                                        style: AppTheme.bodySmall.copyWith(color: AppTheme.danger),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                            
                            const SizedBox(height: AppSpacing.xxl),

                            // Submit Button
                            OpusButton(
                              onPressed: isLoading ? null : _handleLogin,
                              child: Container(
                                height: 52,
                                decoration: BoxDecoration(
                                  borderRadius: BorderRadius.circular(AppRadius.md),
                                  gradient: const LinearGradient(
                                    colors: [AppTheme.accent, AppTheme.accentGlow],
                                    begin: Alignment.topLeft,
                                    end: Alignment.bottomRight,
                                  ),
                                  boxShadow: AppShadows.glow(AppTheme.accent),
                                ),
                                child: Center(
                                  child: isLoading
                                      ? const SizedBox(
                                          width: 24, height: 24,
                                          child: CircularProgressIndicator(color: AppTheme.primary, strokeWidth: 2.5),
                                        )
                                      : Text(
                                          'Sign In', 
                                          style: AppTheme.labelLarge.copyWith(
                                            fontWeight: FontWeight.bold,
                                            color: Colors.white,
                                          ),
                                        ),
                                ),
                              ),
                            ),
                            // Removed extra space inside the form
                          ],
                        ),
                      ),
                    ),
                    
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      'Command Center v1.0',
                      textAlign: TextAlign.center,
                      style: AppTheme.bodySmall.copyWith(color: AppTheme.textTertiary),
                    ),
                    // Removed extra padding at the bottom
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class NetworkPainter extends CustomPainter {
  final double animation;
  NetworkPainter(this.animation);

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), Paint()..color = AppTheme.primary);

    final path = Path();
    final paint = Paint()..style = PaintingStyle.fill;
    
    // Draw flowing wave layers - taller and broader for wide screens
    for (int i = 0; i < 4; i++) {
        paint.color = AppTheme.accent.withOpacity(0.04 + (i * 0.02));
        path.reset();
        
        final startY = size.height * 0.3 + math.sin(animation * 2 * math.pi + i) * 100;
        path.moveTo(0, startY);
        
        path.quadraticBezierTo(
            size.width * 0.35, size.height * 0.2 + math.cos(animation * 2 * math.pi + i * 1.5) * 200,
            size.width * 0.65, size.height * 0.45 + math.sin(animation * 2 * math.pi + i * 2) * 150,
        );
        path.quadraticBezierTo(
            size.width * 0.85, size.height * 0.55 + math.cos(animation * 2 * math.pi + i * 2.5) * 120,
            size.width, size.height * 0.4 + math.sin(animation * 2 * math.pi + i * 3) * 100,
        );
        
        path.lineTo(size.width, size.height);
        path.lineTo(0, size.height);
        canvas.drawPath(path, paint);
    }
    
    // Nodes that are more visible and numerous
    final dotPaint = Paint()
      ..color = AppTheme.accent.withOpacity(0.5)
      ..style = PaintingStyle.fill;
      
    final linePaint = Paint()
      ..color = AppTheme.accent.withOpacity(0.3)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.0;

    final List<Offset> points = [];
    
    for (int i = 0; i < 28; i++) {
        final x = (size.width * (i * 0.05 + animation * 0.2)) % size.width;
        // make them cover more vertical space
        final y = size.height * (0.05 + (i % 8) * 0.12) + math.sin(animation * 2 * math.pi + i) * 60;
        points.add(Offset(x, y));
        canvas.drawCircle(Offset(x, y), 3.0 + (i % 5), dotPaint);
    }
    
    for (int i = 0; i < points.length; i++) {
      for (int j = i + 1; j < points.length; j++) {
        final distance = (points[i] - points[j]).distance;
        if (distance < size.width * 0.3) {
          linePaint.color = AppTheme.accent.withOpacity(0.3 * (1 - distance / (size.width * 0.3)));
          canvas.drawLine(points[i], points[j], linePaint);
        }
      }
    }
  }

  @override
  bool shouldRepaint(covariant NetworkPainter oldDelegate) => oldDelegate.animation != animation;
}

class PromiseLogo extends StatelessWidget {
  final double size;
  final Color color;

  const PromiseLogo({
    super.key,
    required this.size,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      size: Size(size, size),
      painter: _PromiseLogoPainter(color: color),
    );
  }
}

class _PromiseLogoPainter extends CustomPainter {
  final Color color;

  _PromiseLogoPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final double R = size.width / 2;
    final double R_ring = R * 0.52;
    final double cx = size.width / 2;
    final double cy = size.height / 2;

    final Paint paintStroke = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = R * 0.12
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    // 1. Central Ring
    canvas.drawCircle(Offset(cx, cy), R_ring, paintStroke);

    // 2. Spokes
    for (int i = 0; i < 16; i++) {
      final double angle = i * math.pi / 8 - math.pi / 2;
      final Offset dir = Offset(math.cos(angle), math.sin(angle));
      final Offset pInConnected = Offset(cx, cy) + dir * R_ring;

      if (i % 2 == 0) {
        // Long spoke with a ring
        final double rSmall = R * 0.12;
        final Offset pOutLine = Offset(cx, cy) + dir * (R * 0.95 - rSmall);
        canvas.drawLine(pInConnected, pOutLine, paintStroke);
        // Draw the ring
        canvas.drawCircle(Offset(cx, cy) + dir * (R * 0.95), rSmall, paintStroke);
      } else {
        // Short stub
        final Offset pOutStub = Offset(cx, cy) + dir * (R * 0.68);
        canvas.drawLine(pInConnected, pOutStub, paintStroke);
      }
    }

    // 3. 'pe' Letters inside
    final Path pePath = Path();
    final double peWidth = R_ring * 0.9;
    final double peLeft = cx - peWidth * 0.45;
    final double peRight = peLeft + peWidth;
    final double peTop = cy - peWidth * 0.5;
    final double peBottom = cy + peWidth * 0.5;

    // Stem of 'p'
    pePath.moveTo(peLeft, cy + R_ring * 0.75);
    pePath.lineTo(peLeft, cy); 
    
    // Arc for 'pe' loop and curve
    pePath.arcTo(
      Rect.fromLTRB(peLeft, peTop, peRight, peBottom),
      math.pi,        // start at left
      math.pi * 1.55, // sweep ~280 degrees to bottom-left curve
      false,
    );
    
    // Horizontal crossbar
    pePath.moveTo(peLeft, cy);
    pePath.lineTo(peRight, cy);

    // Draw the path
    canvas.drawPath(pePath, paintStroke);
  }

  @override
  bool shouldRepaint(covariant _PromiseLogoPainter oldDelegate) => oldDelegate.color != color;
}
