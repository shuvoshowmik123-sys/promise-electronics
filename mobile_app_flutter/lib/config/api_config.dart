/// API Configuration for TV DAKTAR Flutter App
///
/// This connects to the existing Node.js backend
library;

import 'package:flutter/foundation.dart';

class ApiConfig {
  // Singleton pattern
  static final ApiConfig _instance = ApiConfig._internal();
  factory ApiConfig() => _instance;
  ApiConfig._internal();

  // Production URL
  static const String productionUrl = 'https://promiseelectronics.com';

  // Development URLs
  static const String emulatorUrl = 'http://10.0.2.2:5083'; // Android Emulator
  static const String localhostUrl =
      'http://localhost:5083'; // Web and iOS Simulator

  // Current environment
  static const bool isProduction = bool.fromEnvironment('dart.vm.product');

  /// Get the base URL based on environment and platform
  static String get baseUrl {
    if (isProduction) {
      return productionUrl;
    }
    if (kIsWeb) {
      return localhostUrl;
    }
    return emulatorUrl; // Use emulator URL for Android
  }

  /// API Endpoints
  static String get aiChatEndpoint => '$baseUrl/api/ai/chat';
  static String get healthEndpoint => '$baseUrl/api/health';
  static String get servicesEndpoint => '$baseUrl/api/services';
  static String get serviceRequestsEndpoint => '$baseUrl/api/service-requests';
  static String get productsEndpoint => '$baseUrl/api/products';
  static String get customerLoginEndpoint =>
      '$baseUrl/api/customer/google/native-login';

  /// Mobile App specific endpoints
  static String get mobileSettingsEndpoint => '$baseUrl/api/mobile/settings';
  static String get mobileInventoryEndpoint => '$baseUrl/api/mobile/inventory';

  /// General Settings (for repair options)
  static String get settingsEndpoint => '$baseUrl/api/settings';

  /// User Service Requests
  static String get userServiceRequestsEndpoint =>
      '$baseUrl/api/customer/service-requests';

  /// Track order by ticket number
  static String trackOrderEndpoint(String ticket) =>
      '$baseUrl/api/customer/track/$ticket';

  /// Lens AI Endpoints
  static String get lensIdentifyEndpoint => '$baseUrl/api/lens/identify';
  static String get lensAssessEndpoint => '$baseUrl/api/lens/assess';
  static String jobTrackEndpoint(String jobId) =>
      '$baseUrl/api/job-tickets/track/$jobId';

  /// Request headers
  static Map<String, String> get headers => {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

  /// Request headers with auth token
  static Map<String, String> headersWithAuth(String token) => {
        ...headers,
        'Authorization': 'Bearer $token',
      };
}
