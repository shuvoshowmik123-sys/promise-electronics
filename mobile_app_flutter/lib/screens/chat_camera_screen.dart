import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:camera/camera.dart';
import '../config/app_theme.dart';

/// Custom Camera Screen for Daktar Vai Chat
/// Features: Flashlight toggle, tap-to-focus, capture, preview
class ChatCameraScreen extends StatefulWidget {
  const ChatCameraScreen({super.key});

  @override
  State<ChatCameraScreen> createState() => _ChatCameraScreenState();
}

class _ChatCameraScreenState extends State<ChatCameraScreen>
    with WidgetsBindingObserver {
  CameraController? _controller;
  List<CameraDescription>? _cameras;
  bool _isInitialized = false;
  bool _isFlashOn = false;
  bool _isFocusing = false;
  Offset? _focusPoint;
  String? _errorMessage;
  XFile? _capturedImage;
  bool _isPreviewMode = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _initializeCamera();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;

    if (state == AppLifecycleState.inactive) {
      controller.dispose();
    } else if (state == AppLifecycleState.resumed) {
      _initializeCamera();
    }
  }

  Future<void> _initializeCamera() async {
    try {
      _cameras = await availableCameras();
      if (_cameras == null || _cameras!.isEmpty) {
        setState(() {
          _errorMessage = 'No cameras available';
        });
        return;
      }

      // Use back camera
      final camera = _cameras!.firstWhere(
        (cam) => cam.lensDirection == CameraLensDirection.back,
        orElse: () => _cameras!.first,
      );

      _controller = CameraController(
        camera,
        ResolutionPreset.high,
        enableAudio: false,
        imageFormatGroup: ImageFormatGroup.jpeg,
      );

      await _controller!.initialize();

      // Set autofocus mode
      await _controller!.setFocusMode(FocusMode.auto);

      if (mounted) {
        setState(() {
          _isInitialized = true;
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Failed to initialize camera: $e';
      });
    }
  }

  Future<void> _toggleFlash() async {
    if (_controller == null || !_controller!.value.isInitialized) return;

    try {
      HapticFeedback.lightImpact();
      final newMode = _isFlashOn ? FlashMode.off : FlashMode.torch;
      await _controller!.setFlashMode(newMode);
      setState(() {
        _isFlashOn = !_isFlashOn;
      });
    } catch (e) {
      debugPrint('Flash toggle error: $e');
    }
  }

  Future<void> _onTapToFocus(
      TapDownDetails details, BoxConstraints constraints) async {
    if (_controller == null || !_controller!.value.isInitialized) return;

    final offset = Offset(
      details.localPosition.dx / constraints.maxWidth,
      details.localPosition.dy / constraints.maxHeight,
    );

    try {
      HapticFeedback.selectionClick();
      setState(() {
        _isFocusing = true;
        _focusPoint = details.localPosition;
      });

      await _controller!.setFocusPoint(offset);
      await _controller!.setExposurePoint(offset);

      // Show focus indicator for a moment
      await Future.delayed(const Duration(milliseconds: 800));
      if (mounted) {
        setState(() {
          _isFocusing = false;
          _focusPoint = null;
        });
      }
    } catch (e) {
      debugPrint('Focus error: $e');
      setState(() {
        _isFocusing = false;
        _focusPoint = null;
      });
    }
  }

  Future<void> _captureImage() async {
    if (_controller == null || !_controller!.value.isInitialized) return;
    if (_controller!.value.isTakingPicture) return;

    try {
      HapticFeedback.mediumImpact();

      // Turn off flash for capture if it was on as torch
      if (_isFlashOn) {
        await _controller!.setFlashMode(FlashMode.off);
      }

      final image = await _controller!.takePicture();

      setState(() {
        _capturedImage = image;
        _isPreviewMode = true;
      });
    } catch (e) {
      debugPrint('Capture error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to capture image: $e')),
        );
      }
    }
  }

  void _retakePhoto() {
    HapticFeedback.lightImpact();
    setState(() {
      _capturedImage = null;
      _isPreviewMode = false;
    });
  }

  void _usePhoto() {
    if (_capturedImage != null) {
      HapticFeedback.mediumImpact();
      Navigator.pop(context, _capturedImage!.path);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: _isPreviewMode
            ? _buildPreviewMode(isDark)
            : _buildCameraMode(isDark),
      ),
    );
  }

  Widget _buildCameraMode(bool isDark) {
    return Stack(
      children: [
        // Camera Preview
        if (_isInitialized && _controller != null)
          Positioned.fill(
            child: LayoutBuilder(
              builder: (context, constraints) {
                return GestureDetector(
                  onTapDown: (details) => _onTapToFocus(details, constraints),
                  child: CameraPreview(_controller!),
                );
              },
            ),
          )
        else if (_errorMessage != null)
          Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.error_outline, color: Colors.red, size: 48),
                  const SizedBox(height: 16),
                  Text(
                    _errorMessage!,
                    style: const TextStyle(color: Colors.white),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          )
        else
          const Center(
            child: CircularProgressIndicator(color: AppColors.primary),
          ),

        // Focus indicator
        if (_focusPoint != null)
          Positioned(
            left: _focusPoint!.dx - 30,
            top: _focusPoint!.dy - 30,
            child: AnimatedOpacity(
              opacity: _isFocusing ? 1.0 : 0.0,
              duration: const Duration(milliseconds: 200),
              child: Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  border: Border.all(color: AppColors.primary, width: 2),
                  borderRadius: BorderRadius.circular(8),
                ),
              ),
            ),
          ),

        // Top controls
        Positioned(
          top: 16,
          left: 16,
          right: 16,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              // Close button
              _buildControlButton(
                icon: Icons.close,
                onTap: () => Navigator.pop(context),
              ),
              // Flash button
              _buildControlButton(
                icon: _isFlashOn ? Icons.flash_on : Icons.flash_off,
                onTap: _toggleFlash,
                isActive: _isFlashOn,
              ),
            ],
          ),
        ),

        // Bottom controls
        Positioned(
          bottom: 40,
          left: 0,
          right: 0,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // Capture button
              GestureDetector(
                onTap: _isInitialized ? _captureImage : null,
                child: Container(
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    border: Border.all(color: Colors.white, width: 4),
                  ),
                  child: Container(
                    margin: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      color: Colors.white,
                      shape: BoxShape.circle,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),

        // Hint text
        Positioned(
          bottom: 140,
          left: 0,
          right: 0,
          child: Text(
            'Tap to focus • Capture your TV issue',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.white.withValues(alpha: 0.7),
              fontSize: 14,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildPreviewMode(bool isDark) {
    return Stack(
      children: [
        // Image preview
        if (_capturedImage != null)
          Positioned.fill(
            child: Image.file(
              File(_capturedImage!.path),
              fit: BoxFit.contain,
            ),
          ),

        // Top bar
        Positioned(
          top: 16,
          left: 16,
          child: _buildControlButton(
            icon: Icons.close,
            onTap: _retakePhoto,
          ),
        ),

        // Bottom controls
        Positioned(
          bottom: 40,
          left: 32,
          right: 32,
          child: Row(
            children: [
              // Retake button
              Expanded(
                child: GestureDetector(
                  onTap: _retakePhoto,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.refresh, color: Colors.white),
                        SizedBox(width: 8),
                        Text(
                          'Retake',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 16),
              // Use photo button
              Expanded(
                child: GestureDetector(
                  onTap: _usePhoto,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.check, color: Colors.white),
                        SizedBox(width: 8),
                        Text(
                          'Use Photo',
                          style: TextStyle(
                            color: Colors.white,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildControlButton({
    required IconData icon,
    required VoidCallback onTap,
    bool isActive = false,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
          color: isActive
              ? AppColors.primary
              : Colors.black.withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Icon(
          icon,
          color: Colors.white,
          size: 24,
        ),
      ),
    );
  }
}
