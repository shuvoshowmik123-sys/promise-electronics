import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

/// Diagnostic result for a single check
class DiagnosticResult {
  final String name;
  final String description;
  final bool passed;
  final String? error;
  final Duration? responseTime;
  final DateTime timestamp;

  DiagnosticResult({
    required this.name,
    required this.description,
    required this.passed,
    this.error,
    this.responseTime,
  }) : timestamp = DateTime.now();

  @override
  String toString() {
    return '$name: ${passed ? '✅ PASS' : '❌ FAIL'}${error != null ? ' - $error' : ''}';
  }
}

/// Shuvo Mode Provider - Developer Diagnostic Mode
///
/// This provider manages the "Boss Mode" for app diagnostics:
/// - Secret activation via 7 taps (like Android Developer Options)
/// - Bypass form validation for quick testing
/// - Run comprehensive API diagnostics
/// - Auto-generate test requests
class ShuvoModeProvider extends ChangeNotifier {
  // Activation state
  bool _isEnabled = false;
  int _activationTapCount = 0;
  DateTime? _lastTapTime;
  static const int _requiredTaps = 7;
  static const Duration _tapTimeout = Duration(seconds: 2);

  // Diagnostics
  final List<DiagnosticResult> _diagnostics = [];
  bool _isRunningDiagnostics = false;
  String? _lastDiagnosticReport;

  // Suggestions based on diagnostics
  final List<String> _suggestions = [];

  // Getters
  bool get isEnabled => _isEnabled;
  bool get isRunningDiagnostics => _isRunningDiagnostics;
  List<DiagnosticResult> get diagnostics => List.unmodifiable(_diagnostics);
  List<String> get suggestions => List.unmodifiable(_suggestions);
  String? get lastDiagnosticReport => _lastDiagnosticReport;
  int get tapCount => _activationTapCount;
  int get requiredTaps => _requiredTaps;

  /// Handle tap for secret activation
  /// Returns a message if activation state changed
  String? handleActivationTap() {
    final now = DateTime.now();

    // Reset if too much time passed since last tap
    if (_lastTapTime != null && now.difference(_lastTapTime!) > _tapTimeout) {
      _activationTapCount = 0;
    }

    _lastTapTime = now;
    _activationTapCount++;

    debugPrint('Shuvo Mode: Tap $_activationTapCount/$_requiredTaps');

    // Show countdown hints
    if (_activationTapCount >= 3 && _activationTapCount < _requiredTaps) {
      final remaining = _requiredTaps - _activationTapCount;
      notifyListeners();
      return 'You are $remaining taps away from Developer Mode';
    }

    // Activate on 7th tap
    if (_activationTapCount >= _requiredTaps) {
      _activationTapCount = 0;
      _isEnabled = !_isEnabled;
      notifyListeners();

      if (_isEnabled) {
        return '🔧 Shuvo Mode Activated! Welcome, Boss!';
      } else {
        return '🔒 Shuvo Mode Deactivated';
      }
    }

    return null;
  }

  /// Enable or disable Shuvo Mode directly
  void setEnabled(bool value) {
    if (_isEnabled != value) {
      _isEnabled = value;
      notifyListeners();
    }
  }

  /// Toggle Shuvo Mode
  void toggle() {
    _isEnabled = !_isEnabled;
    notifyListeners();
  }

  /// Add a diagnostic result
  void addDiagnostic(DiagnosticResult result) {
    _diagnostics.add(result);
    _updateSuggestions();
    notifyListeners();
  }

  /// Clear all diagnostics
  void clearDiagnostics() {
    _diagnostics.clear();
    _suggestions.clear();
    _lastDiagnosticReport = null;
    notifyListeners();
  }

  /// Set diagnostics running state
  void setRunningDiagnostics(bool value) {
    _isRunningDiagnostics = value;
    notifyListeners();
  }

  /// Update suggestions based on diagnostic results
  void _updateSuggestions() {
    _suggestions.clear();

    for (final diagnostic in _diagnostics) {
      if (!diagnostic.passed) {
        switch (diagnostic.name) {
          case 'API Health':
            _suggestions.add(
                '🔴 API unreachable: Check internet connection. Try switching between WiFi and mobile data. '
                'Verify server is running at the correct URL.');
            break;
          case 'AI Chat':
            _suggestions.add(
                '🤖 AI Chat issue: Backend AI service may be down. Check Gemini API key in admin panel. '
                'Verify /api/ai/chat endpoint is working.');
            break;
          case 'Auth Service':
            _suggestions.add(
                '🔐 Auth issue: Customer login/register may be failing. Check backend auth routes. '
                'Verify database connection.');
            break;
          case 'Lens AI':
            _suggestions.add(
                '📷 Lens AI issue: Image analysis endpoints failing. Gemini API key may be invalid. '
                'Check /api/lens/identify and /api/lens/assess endpoints.');
            break;
          case 'Mobile Settings':
            _suggestions.add(
                '⚙️ Settings issue: Mobile app settings not loading. Configure in Admin > Mobile App Settings.');
            break;
          case 'Service Request':
            _suggestions.add(
                '📝 Service Request issue: Cannot submit repair requests. Check /api/service-requests endpoint. '
                'Verify form data structure matches backend expectations.');
            break;
        }
      } else if (diagnostic.responseTime != null &&
          diagnostic.responseTime!.inMilliseconds > 5000) {
        _suggestions.add(
            '⚠️ ${diagnostic.name} is slow (${diagnostic.responseTime!.inMilliseconds}ms). '
            'May need backend optimization or better network connection.');
      }
    }

    if (_suggestions.isEmpty && _diagnostics.isNotEmpty) {
      _suggestions.add('✅ All systems operational! App is working correctly.');
    }
  }

  /// Generate a full diagnostic report
  String generateReport() {
    final buffer = StringBuffer();
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln('   SHUVO MODE DIAGNOSTIC REPORT');
    buffer.writeln('   Generated: ${DateTime.now()}');
    buffer.writeln('═══════════════════════════════════════');
    buffer.writeln();

    // Summary
    final passed = _diagnostics.where((d) => d.passed).length;
    final failed = _diagnostics.where((d) => !d.passed).length;
    buffer.writeln('📊 SUMMARY: $passed passed, $failed failed');
    buffer.writeln();

    // Details
    buffer.writeln('📋 DIAGNOSTIC DETAILS:');
    buffer.writeln('───────────────────────────────────────');
    for (final diagnostic in _diagnostics) {
      final status = diagnostic.passed ? '✅' : '❌';
      final time = diagnostic.responseTime != null
          ? ' (${diagnostic.responseTime!.inMilliseconds}ms)'
          : '';
      buffer.writeln('$status ${diagnostic.name}$time');
      buffer.writeln('   ${diagnostic.description}');
      if (diagnostic.error != null) {
        buffer.writeln('   Error: ${diagnostic.error}');
      }
      buffer.writeln();
    }

    // Suggestions
    if (_suggestions.isNotEmpty) {
      buffer.writeln('💡 SUGGESTIONS:');
      buffer.writeln('───────────────────────────────────────');
      for (final suggestion in _suggestions) {
        buffer.writeln(suggestion);
        buffer.writeln();
      }
    }

    buffer.writeln('═══════════════════════════════════════');

    _lastDiagnosticReport = buffer.toString();
    return _lastDiagnosticReport!;
  }

  /// Get test data for quick request submission
  Map<String, dynamic> getTestRequestData() {
    return {
      'brand': 'Samsung',
      'screenSize': '32"',
      'modelNumber': 'SHUVO-TEST-${DateTime.now().millisecondsSinceEpoch}',
      'primaryIssue': 'Display Issue',
      'symptoms': '["No Picture", "Lines on Screen"]',
      'description':
          '[SHUVO MODE TEST] Auto-generated test request for diagnostics. '
              'Created at ${DateTime.now().toIso8601String()}. '
              'This can be safely deleted from admin panel.',
      'servicePreference': 'home_pickup',
      'address': '[TEST] Shuvo Mode Test Address, Dhaka',
      'customerName': '[TEST] Shuvo Mode',
      'phone': '+8801700000000',
      'status': 'Pending',
      'requestIntent': 'repair',
    };
  }
}
