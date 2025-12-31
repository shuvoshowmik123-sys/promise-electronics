import 'dart:convert';
import 'package:http/http.dart' as http;

import '../config/api_config.dart';

/// API Service for making HTTP requests to the backend
class ApiService {
  // Singleton pattern
  static final ApiService _instance = ApiService._internal();
  factory ApiService() => _instance;
  ApiService._internal();

  /// Check if API is reachable
  Future<bool> checkHealth() async {
    try {
      final response = await http
          .get(
            Uri.parse(ApiConfig.healthEndpoint),
            headers: ApiConfig.headers,
          )
          .timeout(const Duration(seconds: 5));

      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }

  /// Send chat message to Daktar Vai AI
  Future<Map<String, dynamic>> sendChatMessage({
    required String message,
    List<Map<String, dynamic>>? history,
    String? imageBase64,
  }) async {
    final body = {
      'message': message,
      if (history != null) 'history': history,
      if (imageBase64 != null) 'image': imageBase64,
    };

    final response = await http
        .post(
          Uri.parse(ApiConfig.aiChatEndpoint),
          headers: ApiConfig.headers,
          body: jsonEncode(body),
        )
        .timeout(const Duration(seconds: 30));

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('API Error: ${response.statusCode}');
    }
  }

  /// Get list of services
  Future<List<dynamic>> getServices() async {
    final response = await http
        .get(
          Uri.parse(ApiConfig.servicesEndpoint),
          headers: ApiConfig.headers,
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to load services');
    }
  }

  /// Submit a service request
  Future<Map<String, dynamic>> submitServiceRequest(
      Map<String, dynamic> data) async {
    final response = await http
        .post(
          Uri.parse(ApiConfig.serviceRequestsEndpoint),
          headers: ApiConfig.headers,
          body: jsonEncode(data),
        )
        .timeout(const Duration(seconds: 15));

    if (response.statusCode == 200 || response.statusCode == 201) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to submit request');
    }
  }

  /// Track order by ticket number
  Future<Map<String, dynamic>> trackOrder(String ticketNumber) async {
    final response = await http
        .get(
          Uri.parse(ApiConfig.trackOrderEndpoint(ticketNumber)),
          headers: ApiConfig.headers,
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Order not found');
    }
  }

  /// Get products for shop
  Future<List<dynamic>> getProducts() async {
    final response = await http
        .get(
          Uri.parse(ApiConfig.productsEndpoint),
          headers: ApiConfig.headers,
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to load products');
    }
  }

  /// Get all settings (for repair options like brands, symptoms)
  Future<List<dynamic>> getAllSettings() async {
    final response = await http
        .get(
          Uri.parse(ApiConfig.settingsEndpoint),
          headers: ApiConfig.headers,
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to load settings');
    }
  }

  /// Get user's service requests
  Future<List<dynamic>> getUserServiceRequests(String token) async {
    final response = await http
        .get(
          Uri.parse(ApiConfig.userServiceRequestsEndpoint),
          headers: ApiConfig.headersWithAuth(token),
        )
        .timeout(const Duration(seconds: 10));

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else {
      throw Exception('Failed to load service requests');
    }
  }
}
