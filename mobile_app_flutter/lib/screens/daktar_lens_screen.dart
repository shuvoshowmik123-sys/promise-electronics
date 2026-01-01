import 'dart:async';
import 'dart:convert';

import 'dart:ui';
import 'package:camera/camera.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/locale_provider.dart';
import '../services/lens_service.dart';
import '../widgets/lens/lens_annotation_overlay.dart';
import '../widgets/lens/diagnosis_chip.dart';
import '../widgets/lens/qr_preview_card.dart';

/// Camera mode for Daktar er Lens
enum LensMode {
  identify,
  assess,
  qrScan,
}

/// Daktar er Lens - AI-powered camera for TV diagnostics
/// Features: Identify components, Assess damage, Scan job QR codes
class DaktarLensScreen extends StatefulWidget {
  const DaktarLensScreen({super.key});

  @override
  State<DaktarLensScreen> createState() => _DaktarLensScreenState();
}

class _DaktarLensScreenState extends State<DaktarLensScreen>
    with WidgetsBindingObserver {
  // Camera controller
  CameraController? _cameraController;
  List<CameraDescription> _cameras = [];
  bool _isCameraInitialized = false;
  bool _isFlashOn = false;
  String? _cameraError;

  // QR Scanner controller
  MobileScannerController? _qrController;

  // Current mode
  LensMode _currentMode = LensMode.identify;

  // Analysis state
  bool _isAnalyzing = false;
  IdentifyResult? _identifyResult;
  AssessResult? _assessResult;
  JobTrackingInfo? _jobInfo;
  bool _showResult = false;

  // Services
  final LensService _lensService = LensService();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initializeCamera();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      return;
    }

    if (state == AppLifecycleState.inactive) {
      _cameraController?.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _initializeCamera();
    }
  }

  Future<void> _initializeCamera() async {
    setState(() {
      _cameraError = null;
    });

    try {
      _cameras = await availableCameras();
      if (_cameras.isEmpty) {
        setState(() {
          _cameraError = kIsWeb
              ? 'Please allow camera access in your browser settings'
              : 'No cameras found on this device';
        });
        return;
      }

      // Use back camera
      final backCamera = _cameras.firstWhere(
        (c) => c.lensDirection == CameraLensDirection.back,
        orElse: () => _cameras.first,
      );

      _cameraController = CameraController(
        backCamera,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await _cameraController!.initialize();

      if (mounted) {
        setState(() {
          _isCameraInitialized = true;
          _cameraError = null;
        });
      }
    } on CameraException catch (e) {
      debugPrint('[Lens] Camera exception: ${e.code} - ${e.description}');
      setState(() {
        if (e.code == 'CameraAccessDenied' || e.code == 'cameraPermission') {
          _cameraError =
              'Camera permission denied. Please enable camera access.';
        } else if (e.code == 'CameraAccessDeniedWithoutPrompt') {
          _cameraError =
              'Camera permission required. Go to Settings to enable.';
        } else {
          _cameraError = 'Camera error: ${e.description ?? e.code}';
        }
      });
    } catch (e) {
      debugPrint('[Lens] Camera init error: $e');
      setState(() {
        _cameraError = 'Failed to initialize camera. Please try again.';
      });
    }
  }

  void _initQrScanner() {
    _qrController = MobileScannerController(
      detectionSpeed: DetectionSpeed.normal,
      facing: CameraFacing.back,
      torchEnabled: _isFlashOn,
    );
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _cameraController?.dispose();
    _qrController?.dispose();
    super.dispose();
  }

  Future<void> _disposeCamera() async {
    if (_cameraController != null) {
      await _cameraController!.dispose();
      if (mounted) {
        setState(() {
          _cameraController = null;
          _isCameraInitialized = false;
        });
      }
    }
  }

  Future<void> _switchMode(LensMode mode) async {
    if (_currentMode == mode) return;

    HapticFeedback.selectionClick();
    setState(() {
      _currentMode = mode;
      _showResult = false;
      _identifyResult = null;
      _assessResult = null;
      _jobInfo = null;
    });

    // Initialize QR scanner if switching to QR mode
    if (mode == LensMode.qrScan) {
      await _disposeCamera();
      _initQrScanner();
    } else {
      _qrController?.dispose();
      _qrController = null;

      // Re-initialize camera if coming from QR mode
      if (!_isCameraInitialized) {
        await _initializeCamera();
      }
    }
  }

  Future<void> _captureAndAnalyze() async {
    // Check if camera is ready
    if (_isAnalyzing) return;
    if (_cameraController == null || !_cameraController!.value.isInitialized) {
      _showErrorSnackbar('Camera not ready. Please wait.');
      return;
    }

    HapticFeedback.mediumImpact();

    setState(() {
      _isAnalyzing = true;
      _showResult = false;
    });

    try {
      // Double-check camera is still valid before capture
      if (_cameraController == null ||
          !_cameraController!.value.isInitialized) {
        throw Exception('Camera was disposed before capture');
      }

      // Capture image
      final XFile image = await _cameraController!.takePicture();
      final bytes = await image.readAsBytes();
      final base64Image = base64Encode(bytes);

      if (_currentMode == LensMode.identify) {
        final result = await _lensService.identifyPart(base64Image);
        if (result != null && mounted) {
          setState(() {
            _identifyResult = result;
            _showResult = true;
          });
        } else if (mounted) {
          _showErrorSnackbar('Could not identify. Please try again.');
        }
      } else if (_currentMode == LensMode.assess) {
        final result = await _lensService.assessDamage(base64Image);
        if (result != null && mounted) {
          setState(() {
            _assessResult = result;
            _showResult = true;
          });
        } else if (mounted) {
          _showErrorSnackbar('Could not assess damage. Please try again.');
        }
      }
    } catch (e) {
      debugPrint('[Lens] Analysis error: $e');
      if (mounted) {
        _showErrorSnackbar('Analysis failed. Please try again.');
      }
    } finally {
      if (mounted) {
        setState(() {
          _isAnalyzing = false;
        });
      }
    }
  }

  void _onQrDetected(BarcodeCapture capture) async {
    if (_isAnalyzing || _showResult) return;

    final barcode = capture.barcodes.firstOrNull;
    if (barcode == null || barcode.rawValue == null) return;

    HapticFeedback.mediumImpact();

    setState(() {
      _isAnalyzing = true;
    });

    try {
      final jobInfo = await _lensService.getJobFromQrCode(barcode.rawValue!);
      if (jobInfo != null && mounted) {
        setState(() {
          _jobInfo = jobInfo;
          _showResult = true;
        });
      } else {
        _showErrorSnackbar('Could not find job info for this QR code.');
      }
    } catch (e) {
      debugPrint('[Lens] QR scan error: $e');
    } finally {
      if (mounted) {
        setState(() {
          _isAnalyzing = false;
        });
      }
    }
  }

  void _toggleFlash() async {
    HapticFeedback.lightImpact();
    setState(() {
      _isFlashOn = !_isFlashOn;
    });

    if (_currentMode == LensMode.qrScan) {
      _qrController?.toggleTorch();
    } else {
      _cameraController?.setFlashMode(
        _isFlashOn ? FlashMode.torch : FlashMode.off,
      );
    }
  }

  void _dismissResult() {
    setState(() {
      _showResult = false;
      _identifyResult = null;
      _assessResult = null;
      _jobInfo = null;
    });
  }

  void _chatWithDaktarVai() {
    Map<String, dynamic> arguments = {};

    if (_identifyResult != null) {
      arguments = {
        'source': 'lens_identify',
        'diagnosis': {
          'label': _identifyResult!.label,
          'labelBn': _identifyResult!.labelBn,
          'confidence': _identifyResult!.confidence,
          'issueType': _identifyResult!.issueType,
          'description': _identifyResult!.description,
        },
      };
    } else if (_assessResult != null) {
      arguments = {
        'source': 'lens_assess',
        'assessment': {
          'severity': _assessResult!.severity,
          'severityBn': _assessResult!.severityBn,
          'damage': _assessResult!.damage,
          'likelyCause': _assessResult!.likelyCause,
        },
      };
    } else if (_jobInfo != null) {
      arguments = {
        'source': 'lens_qr',
        'job': {
          'id': _jobInfo!.id,
          'device': _jobInfo!.deviceDisplay,
          'status': _jobInfo!.status,
          'estimatedCost': _jobInfo!.estimatedCost,
        },
      };
    }

    Navigator.pushReplacementNamed(context, '/chat', arguments: arguments);
  }

  void _showErrorSnackbar(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        behavior: SnackBarBehavior.floating,
        backgroundColor: Colors.red.shade700,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isBangla = Provider.of<LocaleProvider>(context).isBangla;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          // Camera preview
          _buildCameraPreview(),

          // Gradient overlays
          _buildGradientOverlays(),

          // Scanning reticle (for identify/assess modes)
          if (_currentMode != LensMode.qrScan) _buildScanningReticle(isBangla),

          // Annotation overlay (for identify results)
          if (_identifyResult != null && _showResult)
            LensAnnotationOverlay(
              boundingBox: _identifyResult!.boundingBox,
              annotationPosition: const Offset(280, 200),
              isVisible: _showResult,
            ),

          // Diagnosis chip (for identify results)
          if (_identifyResult != null && _showResult)
            Positioned(
              right: 16,
              top: MediaQuery.of(context).size.height * 0.25,
              child: DiagnosisChip(
                label: _identifyResult!.label,
                labelBn: _identifyResult!.labelBn,
                confidence: _identifyResult!.confidence,
                issueType: _identifyResult!.issueType,
                isVisible: _showResult,
              ),
            ),

          // QR Preview card
          if (_jobInfo != null && _showResult)
            Positioned(
              left: 0,
              right: 0,
              bottom: 180,
              child: QrPreviewCard(
                jobInfo: _jobInfo!,
                onClose: _dismissResult,
                onChatWithDaktarVai: _chatWithDaktarVai,
                isVisible: _showResult,
              ),
            ),

          // Top navigation
          _buildTopNavigation(isBangla),

          // Bottom controls
          _buildBottomControls(isBangla),

          // Loading overlay
          if (_isAnalyzing) _buildLoadingOverlay(isBangla),

          // Action prompt for identify/assess results
          if ((_identifyResult != null || _assessResult != null) && _showResult)
            _buildActionPrompt(isBangla),
        ],
      ),
    );
  }

  Widget _buildCameraPreview() {
    if (_currentMode == LensMode.qrScan) {
      // Use MobileScanner for QR mode
      return _qrController != null
          ? MobileScanner(
              controller: _qrController!,
              onDetect: _onQrDetected,
              errorBuilder: (context, error) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(16.0),
                    child: Text(
                      'Scanner Error: ${error.errorCode}\n${error.errorDetails?.message ?? ""}',
                      textAlign: TextAlign.center,
                      style: const TextStyle(color: Colors.red),
                    ),
                  ),
                );
              },
            )
          : const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            );
    }

    // Show error state if camera failed
    if (_cameraError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.camera_alt_outlined,
                size: 64,
                color: Colors.white.withValues(alpha: 0.5),
              ),
              const SizedBox(height: 16),
              Text(
                _cameraError!,
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.8),
                  fontSize: 14,
                ),
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: _initializeCamera,
                icon: const Icon(Icons.refresh),
                label: const Text('Retry'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
    }

    // Use Camera for identify/assess modes
    if (!_isCameraInitialized ||
        _cameraController == null ||
        !_cameraController!.value.isInitialized) {
      return const Center(
        child: CircularProgressIndicator(color: AppColors.primary),
      );
    }

    return Transform.scale(
      scale: 1.0,
      child: Center(
        child: CameraPreview(_cameraController!),
      ),
    );
  }

  Widget _buildGradientOverlays() {
    return IgnorePointer(
      child: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              Colors.black.withValues(alpha: 0.5),
              Colors.transparent,
              Colors.transparent,
              Colors.black.withValues(alpha: 0.3),
            ],
            stops: const [0.0, 0.2, 0.7, 1.0],
          ),
        ),
      ),
    );
  }

  Widget _buildScanningReticle(bool isBangla) {
    return Center(
      child: Container(
        width: 280,
        height: 280,
        decoration: BoxDecoration(
          border: Border.all(
            color: AppColors.primary.withValues(alpha: 0.3),
            width: 1,
          ),
          borderRadius: BorderRadius.circular(32),
        ),
        child: Stack(
          children: [
            // Corner indicators
            _buildCorner(Alignment.topLeft),
            _buildCorner(Alignment.topRight),
            _buildCorner(Alignment.bottomLeft),
            _buildCorner(Alignment.bottomRight),

            // Center dot
            if (!_isAnalyzing)
              Center(
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.8),
                    shape: BoxShape.circle,
                  ),
                ),
              ),

            // Mode label
            Positioned(
              top: -40,
              left: 0,
              right: 0,
              child: Center(
                child: _buildModeLabel(isBangla),
              ),
            ),
          ],
        ),
      )
          .animate(
            onPlay: (controller) => controller.repeat(reverse: true),
          )
          .scale(
            begin: const Offset(1.0, 1.0),
            end: const Offset(1.02, 1.02),
            duration: 2000.ms,
          ),
    );
  }

  Widget _buildCorner(Alignment alignment) {
    final isTop =
        alignment == Alignment.topLeft || alignment == Alignment.topRight;
    final isLeft =
        alignment == Alignment.topLeft || alignment == Alignment.bottomLeft;

    return Positioned(
      top: isTop ? -1 : null,
      bottom: !isTop ? -1 : null,
      left: isLeft ? -1 : null,
      right: !isLeft ? -1 : null,
      child: Container(
        width: 24,
        height: 24,
        decoration: BoxDecoration(
          border: Border(
            top: isTop
                ? const BorderSide(color: AppColors.primary, width: 3)
                : BorderSide.none,
            bottom: !isTop
                ? const BorderSide(color: AppColors.primary, width: 3)
                : BorderSide.none,
            left: isLeft
                ? const BorderSide(color: AppColors.primary, width: 3)
                : BorderSide.none,
            right: !isLeft
                ? const BorderSide(color: AppColors.primary, width: 3)
                : BorderSide.none,
          ),
          borderRadius: BorderRadius.only(
            topLeft: alignment == Alignment.topLeft
                ? const Radius.circular(16)
                : Radius.zero,
            topRight: alignment == Alignment.topRight
                ? const Radius.circular(16)
                : Radius.zero,
            bottomLeft: alignment == Alignment.bottomLeft
                ? const Radius.circular(16)
                : Radius.zero,
            bottomRight: alignment == Alignment.bottomRight
                ? const Radius.circular(16)
                : Radius.zero,
          ),
        ),
      ),
    );
  }

  Widget _buildModeLabel(bool isBangla) {
    String label;
    IconData icon;

    switch (_currentMode) {
      case LensMode.identify:
        label =
            isBangla ? 'উপাদান সনাক্ত করা হচ্ছে...' : 'Scanning Component...';
        icon = Icons.search;
        break;
      case LensMode.assess:
        label = isBangla ? 'ক্ষতি বিশ্লেষণ...' : 'Analyzing Damage...';
        icon = Icons.analytics;
        break;
      case LensMode.qrScan:
        label = isBangla ? 'জব QR স্ক্যান করুন' : 'Scan Job QR Code';
        icon = Icons.qr_code_scanner;
        break;
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: Colors.black.withValues(alpha: 0.5),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: AppColors.primary.withValues(alpha: 0.5),
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 16, color: AppColors.primary),
              const SizedBox(width: 8),
              Text(
                label,
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTopNavigation(bool isBangla) {
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Close button
              _buildGlassButton(
                icon: Icons.close,
                onTap: () => Navigator.pop(context),
              ),

              // Title
              ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: BackdropFilter(
                  filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
                  child: Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.black.withValues(alpha: 0.3),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      isBangla ? 'ডাক্তার এর লেন্স' : 'Daktar er Lens',
                      style: const TextStyle(
                        color: Colors.white,
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ),
              ),

              // Flash and more buttons
              Row(
                children: [
                  _buildGlassButton(
                    icon: _isFlashOn ? Icons.flash_on : Icons.flash_off,
                    onTap: _toggleFlash,
                  ),
                  const SizedBox(width: 8),
                  _buildGlassButton(
                    icon: Icons.more_vert,
                    onTap: () => _showMoreMenu(isBangla),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildGlassButton({
    required IconData icon,
    required VoidCallback onTap,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: Colors.white.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.2),
              ),
            ),
            child: Icon(icon, color: Colors.white, size: 22),
          ),
        ),
      ),
    );
  }

  Widget _buildBottomControls(bool isBangla) {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: ClipRRect(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(32)),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            padding: EdgeInsets.fromLTRB(
              24,
              24,
              24,
              24 + MediaQuery.of(context).padding.bottom,
            ),
            decoration: BoxDecoration(
              color: Theme.of(context).brightness == Brightness.dark
                  ? Colors.black.withValues(alpha: 0.7)
                  : Colors.white.withValues(alpha: 0.9),
              borderRadius:
                  const BorderRadius.vertical(top: Radius.circular(32)),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Drag handle
                Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: Colors.grey.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
                const SizedBox(height: 20),

                // Mode selector
                _buildModeSelector(isBangla),
                const SizedBox(height: 24),

                // Camera controls
                if (_currentMode != LensMode.qrScan) _buildCameraControls(),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildModeSelector(bool isBangla) {
    return Container(
      height: 48,
      decoration: BoxDecoration(
        color: Colors.grey.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(24),
      ),
      padding: const EdgeInsets.all(4),
      child: Row(
        children: [
          _buildModeButton(
            LensMode.identify,
            isBangla ? 'সনাক্ত' : 'Identify',
          ),
          _buildModeButton(
            LensMode.assess,
            isBangla ? 'মূল্যায়ন' : 'Assess',
          ),
          _buildModeButton(
            LensMode.qrScan,
            isBangla ? 'QR স্ক্যান' : 'QR Scan',
          ),
        ],
      ),
    );
  }

  Widget _buildModeButton(LensMode mode, String label) {
    final isActive = _currentMode == mode;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Expanded(
      child: GestureDetector(
        onTap: () => _switchMode(mode),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: BoxDecoration(
            color: isActive
                ? (isDark ? AppColors.surfaceDark : Colors.white)
                : Colors.transparent,
            borderRadius: BorderRadius.circular(20),
            boxShadow: isActive
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.1),
                      blurRadius: 8,
                    ),
                  ]
                : null,
          ),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                color: isActive
                    ? AppColors.primary
                    : (isDark ? Colors.white70 : Colors.black54),
                fontSize: 13,
                fontWeight: isActive ? FontWeight.bold : FontWeight.w500,
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildCameraControls() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        // Gallery button
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: Colors.grey.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: Colors.white.withValues(alpha: 0.3),
              width: 2,
            ),
          ),
          child: const Icon(
            Icons.photo_library_outlined,
            color: Colors.grey,
          ),
        ),

        // Capture button
        GestureDetector(
          onTap: _isAnalyzing ? null : _captureAndAnalyze,
          child: Container(
            width: 80,
            height: 80,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: AppColors.primary.withValues(alpha: 0.3),
                width: 4,
              ),
            ),
            padding: const EdgeInsets.all(4),
            child: Container(
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: AppColors.primary,
                boxShadow: [
                  BoxShadow(
                    color: AppColors.primary.withValues(alpha: 0.4),
                    blurRadius: 20,
                  ),
                ],
              ),
              child: Icon(
                _isAnalyzing ? Icons.hourglass_empty : Icons.camera_alt,
                color: Colors.white,
                size: 32,
              ),
            ),
          ),
        ),

        // Switch camera button
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: Colors.grey.withValues(alpha: 0.2),
            borderRadius: BorderRadius.circular(16),
          ),
          child: const Icon(
            Icons.cameraswitch_outlined,
            color: Colors.grey,
          ),
        ),
      ],
    );
  }

  Widget _buildLoadingOverlay(bool isBangla) {
    return Container(
      color: Colors.black.withValues(alpha: 0.5),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const CircularProgressIndicator(
              color: AppColors.primary,
              strokeWidth: 3,
            ),
            const SizedBox(height: 16),
            Text(
              isBangla ? 'বিশ্লেষণ করা হচ্ছে...' : 'Analyzing...',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionPrompt(bool isBangla) {
    return Positioned(
      left: 16,
      right: 16,
      bottom: 200,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Colors.black.withValues(alpha: 0.6),
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: Colors.white.withValues(alpha: 0.2),
              ),
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.smart_toy_rounded,
                        color: AppColors.primary,
                        size: 24,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            isBangla
                                ? 'ডাক্তার ভাই এর সাথে আলোচনা করুন'
                                : 'Discuss with Daktar Vai',
                            style: const TextStyle(
                              color: Colors.white,
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            isBangla
                                ? 'এই সমস্যা সম্পর্কে আরও জানুন'
                                : 'Learn more about this issue',
                            style: TextStyle(
                              color: Colors.white.withValues(alpha: 0.6),
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: _dismissResult,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: Colors.white,
                          side: BorderSide(
                              color: Colors.white.withValues(alpha: 0.3)),
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Text(isBangla ? 'না' : 'Close'),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: _chatWithDaktarVai,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.chat, size: 18),
                            const SizedBox(width: 8),
                            Text(isBangla ? 'হ্যাঁ, চ্যাট করুন' : 'Yes, Chat'),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      )
          .animate(target: _showResult ? 1 : 0)
          .fadeIn(duration: 300.ms)
          .slideY(begin: 0.2, end: 0),
    );
  }

  void _showMoreMenu(bool isBangla) {
    showModalBottomSheet(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: BoxDecoration(
          color: Theme.of(context).scaffoldBackgroundColor,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.grey.withValues(alpha: 0.3),
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(height: 20),
              ListTile(
                leading: const Icon(Icons.help_outline),
                title: Text(isBangla ? 'কিভাবে ব্যবহার করবেন' : 'How to use'),
                onTap: () {
                  Navigator.pop(context);
                  _showHelpDialog(isBangla);
                },
              ),
              ListTile(
                leading: const Icon(Icons.history),
                title: Text(isBangla ? 'স্ক্যান ইতিহাস' : 'Scan History'),
                onTap: () {
                  Navigator.pop(context);
                  _showHistoryDialog(isBangla);
                },
              ),
              ListTile(
                leading: const Icon(Icons.feedback_outlined),
                title: Text(isBangla ? 'মতামত দিন' : 'Send Feedback'),
                onTap: () {
                  Navigator.pop(context);
                  // Show feedback form
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content:
                          Text(isBangla ? 'শীঘ্রই আসছে...' : 'Coming soon...'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  void _showHelpDialog(bool isBangla) {
    showDialog(
      context: context,
      builder: (context) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.help_outline,
                        color: AppColors.primary),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Text(
                      isBangla ? 'কিভাবে ব্যবহার করবেন' : 'How to use Lens',
                      style: const TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Instructions
              SingleChildScrollView(
                child: Column(
                  children: [
                    _buildHelpItem(
                      icon: Icons.search,
                      title: isBangla ? '১. সনাক্ত (Identify)' : '1. Identify',
                      description: isBangla
                          ? 'টিভির যেকোনো অংশের দিকে ক্যামেরা ধরুন। এআই বলে দেবে এটি কি এবং এর কাজ কি।'
                          : 'Point camera at any TV part. AI will tell you what it is and what it does.',
                      isBangla: isBangla,
                    ),
                    const SizedBox(height: 16),
                    _buildHelpItem(
                      icon: Icons.analytics,
                      title: isBangla ? '২. মূল্যায়ন (Assess)' : '2. Assess',
                      description: isBangla
                          ? 'টিভির ভাঙা বা নষ্ট অংশের ছবি তুলুন। এআই ক্ষতির পরিমাণ এবং মেরামতের খরচ জানাবে।'
                          : 'Capture broken TV parts. AI will estimate damage severity and repair costs.',
                      isBangla: isBangla,
                    ),
                    const SizedBox(height: 16),
                    _buildHelpItem(
                      icon: Icons.qr_code_scanner,
                      title: isBangla ? '৩. QR স্ক্যান' : '3. QR Scan',
                      description: isBangla
                          ? 'আপনার জব কার্ডের QR কোড স্ক্যান করে মেরামতের বর্তমান অবস্থা জানুন।'
                          : 'Scan your job card QR code to check current repair status instantly.',
                      isBangla: isBangla,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),

              // Action Button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: () => Navigator.pop(context),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                  ),
                  child: Text(isBangla ? 'বুঝেছি' : 'Got it'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHelpItem({
    required IconData icon,
    required String title,
    required String description,
    required bool isBangla,
  }) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.grey[100],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color:
              isDark ? Colors.white.withValues(alpha: 0.1) : Colors.grey[300]!,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: AppColors.textSubLight),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: TextStyle(
                    fontWeight: FontWeight.bold,
                    fontSize: 14,
                    color: isDark ? Colors.white : Colors.black,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: TextStyle(
                    fontSize: 12,
                    color: isDark ? Colors.grey[400] : Colors.grey[700],
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _showHistoryDialog(bool isBangla) {
    // Mock history data
    final historyItems = [];

    showDialog(
      context: context,
      builder: (context) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        backgroundColor: Theme.of(context).scaffoldBackgroundColor,
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.history, color: AppColors.primary),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isBangla ? 'স্ক্যান ইতিহাস' : 'Scan History',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          isBangla
                              ? 'বিস্তারিত দেখতে ট্যাপ করুন'
                              : 'Tap to view details',
                          style: TextStyle(
                            fontSize: 12,
                            color: Colors.grey[600],
                          ),
                        ),
                      ],
                    ),
                  ),
                  IconButton(
                    icon: const Icon(Icons.close),
                    onPressed: () => Navigator.pop(context),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // History List
              Flexible(
                child: historyItems.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.all(32.0),
                          child: Text(
                            isBangla
                                ? 'কোনো ইতিহাস পাওয়া যায়নি'
                                : 'No history found',
                            style: TextStyle(color: Colors.grey[500]),
                          ),
                        ),
                      )
                    : ListView.separated(
                        shrinkWrap: true,
                        itemCount: historyItems.length,
                        separatorBuilder: (context, index) =>
                            const SizedBox(height: 12),
                        itemBuilder: (context, index) {
                          final item = historyItems[index];
                          return _buildHistoryItem(item, isBangla);
                        },
                      ),
              ),

              const SizedBox(height: 16),

              // Clear History Button (Mock)
              TextButton(
                onPressed: () {
                  Navigator.pop(context);
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(isBangla
                          ? 'ইতিহাস মুছে ফেলা হয়েছে'
                          : 'History cleared'),
                      behavior: SnackBarBehavior.floating,
                    ),
                  );
                },
                child: Text(
                  isBangla ? 'ইতিহাস মুছুন' : 'Clear History',
                  style: TextStyle(color: Colors.grey[600]),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHistoryItem(Map<String, dynamic> item, bool isBangla) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final color = item['color'] as Color;

    return GestureDetector(
      onTap: () {
        // Restore result logic
        Navigator.pop(context);
        _restoreHistoryItem(item);
      },
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color:
              isDark ? Colors.white.withValues(alpha: 0.05) : Colors.grey[100],
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isDark
                ? Colors.white.withValues(alpha: 0.1)
                : Colors.grey[300]!,
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(item['icon'] as IconData, size: 20, color: color),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item['title'] as String,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 14,
                      color: isDark ? Colors.white : Colors.black,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item['subtitle'] as String,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                      color: color,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    item['date'] as String,
                    style: TextStyle(
                      fontSize: 11,
                      color: isDark ? Colors.grey[400] : Colors.grey[600],
                    ),
                  ),
                ],
              ),
            ),

            // Chat Action Button
            IconButton(
              icon: const Icon(Icons.chat_bubble_outline, size: 20),
              color: AppColors.primary,
              tooltip:
                  isBangla ? 'ডাক্তার ভাইয়ের সাথে কথা বলুন' : 'Ask Daktar Vai',
              onPressed: () {
                Navigator.pop(context);
                _chatAboutHistoryItem(item);
              },
            ),
          ],
        ),
      ),
    );
  }

  void _restoreHistoryItem(Map<String, dynamic> item) {
    setState(() {
      final type = item['type'] as String;
      final data = item['data'] as Map<String, dynamic>;

      if (type == 'identify') {
        _currentMode = LensMode.identify;
        _identifyResult = IdentifyResult(
          label: data['label'],
          labelBn: data['labelBn'],
          confidence: (data['confidence'] as num).toDouble(),
          issueType: data['issueType'],
          description: data['description'],
          descriptionBn: data['descriptionBn'] ?? data['description'] ?? '',
          boundingBox:
              BoundingBox(x: 100, y: 200, width: 200, height: 200), // Mock box
          rawText: '',
        );
        _showResult = true;
      } else if (type == 'assess') {
        _currentMode = LensMode.assess;
        _assessResult = AssessResult(
          severity: data['severity'],
          severityBn: data['severityBn'],
          damage: [data['damage']], // Wrap in list
          likelyCause: data['likelyCause'],
          likelyCauseBn: data['likelyCauseBn'] ?? '',
          rawText: '',
        );
        _showResult = true;
      } else if (type == 'qr') {
        _currentMode = LensMode.qrScan;
        _jobInfo = JobTrackingInfo(
          id: data['id'],
          device: data['device'],
          status: data['status'],
          estimatedCost: double.tryParse(data['estimatedCost']
              .toString()
              .replaceAll(RegExp(r'[^0-9.]'), '')),
        );
        _showResult = true;
      }
    });
  }

  void _chatAboutHistoryItem(Map<String, dynamic> item) {
    final type = item['type'] as String;
    final title = item['title'] as String;
    final imageUrl = item['imageUrl'] as String?;

    // Navigate to chat with context
    Navigator.pushNamed(context, '/chat', arguments: {
      'source': 'history',
      'message': 'Tell me more about the $title scan I did.',
      'imageUrl': imageUrl,
    });
  }
}
