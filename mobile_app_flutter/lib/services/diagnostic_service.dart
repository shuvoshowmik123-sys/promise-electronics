import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';
import '../providers/shuvo_mode_provider.dart';

/// Diagnostic Service for Shuvo Mode
///
/// Runs comprehensive health checks on all app features:
/// - API endpoint connectivity
/// - Feature availability
/// - Response time monitoring
/// - Device and app info collection
class DiagnosticService {
  static final DiagnosticService _instance = DiagnosticService._internal();
  factory DiagnosticService() => _instance;
  DiagnosticService._internal();

  /// Run all diagnostic checks
  Future<List<DiagnosticResult>> runAllDiagnostics({
    required ShuvoModeProvider provider,
    Function(String)? onProgress,
  }) async {
    provider.clearDiagnostics();
    provider.setRunningDiagnostics(true);

    try {
      // API Health Check
      onProgress?.call('Checking API health...');
      provider.addDiagnostic(await checkApiHealth());

      // AI Chat Endpoint
      onProgress?.call('Testing AI Chat...');
      provider.addDiagnostic(await checkAiChat());

      // Auth Endpoints
      onProgress?.call('Testing Auth Service...');
      provider.addDiagnostic(await checkAuthService());

      // Lens AI Endpoints
      onProgress?.call('Testing Lens AI...');
      provider.addDiagnostic(await checkLensAi());

      // Mobile Settings
      onProgress?.call('Testing Mobile Settings...');
      provider.addDiagnostic(await checkMobileSettings());

      // Service Request (dry run)
      onProgress?.call('Testing Service Request...');
      provider.addDiagnostic(await checkServiceRequest());

      // Products/Inventory
      onProgress?.call('Testing Inventory...');
      provider.addDiagnostic(await checkInventory());

      onProgress?.call('Diagnostics complete!');

      return provider.diagnostics;
    } finally {
      provider.setRunningDiagnostics(false);
    }
  }

  /// Check basic API health
  Future<DiagnosticResult> checkApiHealth() async {
    final stopwatch = Stopwatch()..start();

    try {
      final response = await http
          .get(Uri.parse(ApiConfig.healthEndpoint))
          .timeout(const Duration(seconds: 10));

      stopwatch.stop();

      if (response.statusCode == 200) {
        return DiagnosticResult(
          name: 'API Health',
          description: 'Backend server is reachable at ${ApiConfig.baseUrl}',
          passed: true,
          responseTime: stopwatch.elapsed,
        );
      } else {
        return DiagnosticResult(
          name: 'API Health',
          description: 'Backend returned status ${response.statusCode}',
          passed: false,
          error: 'HTTP ${response.statusCode}',
          responseTime: stopwatch.elapsed,
        );
      }
    } catch (e) {
      stopwatch.stop();
      return DiagnosticResult(
        name: 'API Health',
        description: 'Cannot reach backend at ${ApiConfig.baseUrl}',
        passed: false,
        error: e.toString(),
        responseTime: stopwatch.elapsed,
      );
    }
  }

  /// Check AI Chat endpoint
  Future<DiagnosticResult> checkAiChat() async {
    final stopwatch = Stopwatch()..start();

    try {
      final response = await http
          .post(
            Uri.parse(ApiConfig.aiChatEndpoint),
            headers: ApiConfig.headers,
            body: jsonEncode({
              'message':
                  '[SHUVO MODE DIAGNOSTIC] Test message - please respond with OK',
              'history': [],
            }),
          )
          .timeout(const Duration(seconds: 30));

      stopwatch.stop();

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return DiagnosticResult(
          name: 'AI Chat',
          description:
              'AI Chat is responding. Response: ${(data['text'] ?? 'No text').toString().substring(0, 50)}...',
          passed: true,
          responseTime: stopwatch.elapsed,
        );
      } else {
        return DiagnosticResult(
          name: 'AI Chat',
          description: 'AI Chat endpoint returned error',
          passed: false,
          error:
              'HTTP ${response.statusCode}: ${response.body.substring(0, 100)}',
          responseTime: stopwatch.elapsed,
        );
      }
    } catch (e) {
      stopwatch.stop();
      return DiagnosticResult(
        name: 'AI Chat',
        description: 'AI Chat endpoint failed',
        passed: false,
        error: e.toString(),
        responseTime: stopwatch.elapsed,
      );
    }
  }

  /// Check Auth endpoints
  Future<DiagnosticResult> checkAuthService() async {
    final stopwatch = Stopwatch()..start();

    try {
      // Just check if the endpoint exists (we won't actually login)
      final response = await http
          .post(
            Uri.parse(ApiConfig.customerLoginEndpoint),
            headers: ApiConfig.headers,
            body: jsonEncode({
              'phone': '+8801700000000',
              'password': 'test_diagnostic_check',
            }),
          )
          .timeout(const Duration(seconds: 10));

      stopwatch.stop();

      // We expect 401 or 400 for invalid credentials, 500+ would be a server error
      if (response.statusCode < 500) {
        return DiagnosticResult(
          name: 'Auth Service',
          description: 'Auth endpoint is reachable and responding',
          passed: true,
          responseTime: stopwatch.elapsed,
        );
      } else {
        return DiagnosticResult(
          name: 'Auth Service',
          description: 'Auth service has server error',
          passed: false,
          error: 'HTTP ${response.statusCode}',
          responseTime: stopwatch.elapsed,
        );
      }
    } catch (e) {
      stopwatch.stop();
      return DiagnosticResult(
        name: 'Auth Service',
        description: 'Auth endpoint unreachable',
        passed: false,
        error: e.toString(),
        responseTime: stopwatch.elapsed,
      );
    }
  }

  /// Check Lens AI endpoints
  Future<DiagnosticResult> checkLensAi() async {
    final stopwatch = Stopwatch()..start();

    try {
      // Check identify endpoint with minimal data
      final response = await http
          .get(Uri.parse(ApiConfig.lensIdentifyEndpoint))
          .timeout(const Duration(seconds: 10));

      stopwatch.stop();

      // We expect 400 (no image provided) or 405 (method not allowed for GET)
      // 500+ would indicate server error
      if (response.statusCode < 500) {
        return DiagnosticResult(
          name: 'Lens AI',
          description: 'Lens AI endpoints are available',
          passed: true,
          responseTime: stopwatch.elapsed,
        );
      } else {
        return DiagnosticResult(
          name: 'Lens AI',
          description: 'Lens AI has server error',
          passed: false,
          error: 'HTTP ${response.statusCode}',
          responseTime: stopwatch.elapsed,
        );
      }
    } catch (e) {
      stopwatch.stop();
      return DiagnosticResult(
        name: 'Lens AI',
        description: 'Lens AI endpoints unreachable',
        passed: false,
        error: e.toString(),
        responseTime: stopwatch.elapsed,
      );
    }
  }

  /// Check Mobile Settings endpoint
  Future<DiagnosticResult> checkMobileSettings() async {
    final stopwatch = Stopwatch()..start();

    try {
      final response = await http
          .get(
            Uri.parse(ApiConfig.mobileSettingsEndpoint),
            headers: ApiConfig.headers,
          )
          .timeout(const Duration(seconds: 10));

      stopwatch.stop();

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        final hasSettings = data != null && (data is Map || data is List);
        return DiagnosticResult(
          name: 'Mobile Settings',
          description: hasSettings
              ? 'Mobile settings loaded successfully'
              : 'Mobile settings response is empty',
          passed: hasSettings,
          responseTime: stopwatch.elapsed,
        );
      } else {
        return DiagnosticResult(
          name: 'Mobile Settings',
          description: 'Mobile settings endpoint error',
          passed: false,
          error: 'HTTP ${response.statusCode}',
          responseTime: stopwatch.elapsed,
        );
      }
    } catch (e) {
      stopwatch.stop();
      return DiagnosticResult(
        name: 'Mobile Settings',
        description: 'Mobile settings endpoint unreachable',
        passed: false,
        error: e.toString(),
        responseTime: stopwatch.elapsed,
      );
    }
  }

  /// Check Service Request endpoint (without actually submitting)
  Future<DiagnosticResult> checkServiceRequest() async {
    final stopwatch = Stopwatch()..start();

    try {
      // Check settings endpoint which provides form options
      final response = await http
          .get(
            Uri.parse(ApiConfig.settingsEndpoint),
            headers: ApiConfig.headers,
          )
          .timeout(const Duration(seconds: 10));

      stopwatch.stop();

      if (response.statusCode == 200) {
        return DiagnosticResult(
          name: 'Service Request',
          description: 'Service request form data available',
          passed: true,
          responseTime: stopwatch.elapsed,
        );
      } else {
        return DiagnosticResult(
          name: 'Service Request',
          description: 'Service request settings unavailable',
          passed: false,
          error: 'HTTP ${response.statusCode}',
          responseTime: stopwatch.elapsed,
        );
      }
    } catch (e) {
      stopwatch.stop();
      return DiagnosticResult(
        name: 'Service Request',
        description: 'Service request endpoint unreachable',
        passed: false,
        error: e.toString(),
        responseTime: stopwatch.elapsed,
      );
    }
  }

  /// Check Inventory/Products endpoint
  Future<DiagnosticResult> checkInventory() async {
    final stopwatch = Stopwatch()..start();

    try {
      final response = await http
          .get(
            Uri.parse(ApiConfig.mobileInventoryEndpoint),
            headers: ApiConfig.headers,
          )
          .timeout(const Duration(seconds: 10));

      stopwatch.stop();

      if (response.statusCode == 200) {
        return DiagnosticResult(
          name: 'Inventory',
          description: 'Inventory/Products endpoint working',
          passed: true,
          responseTime: stopwatch.elapsed,
        );
      } else {
        return DiagnosticResult(
          name: 'Inventory',
          description: 'Inventory endpoint error',
          passed: false,
          error: 'HTTP ${response.statusCode}',
          responseTime: stopwatch.elapsed,
        );
      }
    } catch (e) {
      stopwatch.stop();
      return DiagnosticResult(
        name: 'Inventory',
        description: 'Inventory endpoint unreachable',
        passed: false,
        error: e.toString(),
        responseTime: stopwatch.elapsed,
      );
    }
  }

  /// Get device and app information
  Future<Map<String, String>> getDeviceInfo() async {
    final info = <String, String>{};

    // Basic platform info (no external packages needed)
    info['Platform'] = kIsWeb
        ? 'Web'
        : (Platform.isAndroid
            ? 'Android'
            : Platform.isIOS
                ? 'iOS'
                : 'Unknown');
    info['Debug Mode'] = kDebugMode ? 'YES' : 'NO';
    info['Release Mode'] = kReleaseMode ? 'YES' : 'NO';

    if (!kIsWeb) {
      info['OS Version'] = Platform.operatingSystemVersion;
      info['Dart Version'] = Platform.version.split(' ').first;
      info['Locale'] = Platform.localeName;
    }

    // API Config
    info['API Base URL'] = ApiConfig.baseUrl;
    info['Is Production'] = ApiConfig.isProduction.toString();

    return info;
  }
}
