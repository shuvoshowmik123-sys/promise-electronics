import 'dart:convert';
import 'package:flutter/foundation.dart';
import '../services/api_client.dart';
import '../config/api_config.dart';

class RepairProvider with ChangeNotifier {
  final ApiClient _apiClient = ApiClient();

  // Settings Data
  List<String> _brands = ['Samsung', 'LG', 'Sony', 'Walton', 'Vision'];
  List<String> _screenSizes = ['32 inch', '43 inch', '50 inch', '55 inch'];
  List<String> _symptoms = [];
  List<String> _serviceCategories = [];

  // User Data
  List<Map<String, dynamic>> _activeRepairs = [];
  List<Map<String, dynamic>> _completedRepairs = [];

  bool _isLoading = false;
  String? _error;

  // Getters
  List<String> get brands => _brands;
  List<String> get screenSizes => _screenSizes;
  List<String> get symptoms => _symptoms;
  List<String> get serviceCategories => _serviceCategories;
  List<Map<String, dynamic>> get activeRepairs => _activeRepairs;
  List<Map<String, dynamic>> get completedRepairs => _completedRepairs;
  bool get isLoading => _isLoading;
  String? get error => _error;

  /// Fetch repair settings (brands, symptoms, etc.)
  Future<void> fetchSettings() async {
    _isLoading = true;
    notifyListeners();

    try {
      final response = await _apiClient.get(ApiConfig.settingsEndpoint);

      if (response.statusCode == 200) {
        final List<dynamic> settings = response.data;

        // Parse settings
        for (var setting in settings) {
          if (setting['key'] == 'tv_brands') {
            _brands = List<String>.from(_parseJsonList(setting['value']));
          } else if (setting['key'] == 'tv_inches') {
            _screenSizes = List<String>.from(_parseJsonList(setting['value']));
          } else if (setting['key'] == 'common_symptoms') {
            _symptoms = List<String>.from(_parseJsonList(setting['value']));
          } else if (setting['key'] == 'service_categories') {
            _serviceCategories =
                List<String>.from(_parseJsonList(setting['value']));
          }
        }
      }
    } catch (e) {
      debugPrint('Failed to fetch repair settings: $e');
      _error = 'Failed to load options';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  List<dynamic> _parseJsonList(String jsonStr) {
    try {
      return jsonDecode(jsonStr) as List<dynamic>;
    } catch (e) {
      debugPrint('JSON parse error: $e');
      return [];
    }
  }

  /// Fetch user's repair history
  Future<void> fetchUserRepairs() async {
    _isLoading = true;
    notifyListeners();

    try {
      final response =
          await _apiClient.get(ApiConfig.userServiceRequestsEndpoint);

      if (response.statusCode == 200) {
        final List<dynamic> requests = response.data;

        _activeRepairs = [];
        _completedRepairs = [];

        for (var req in requests) {
          final Map<String, dynamic> repair = Map<String, dynamic>.from(req);

          // Categorize based on trackingStatus (API field name)
          final status = (repair['trackingStatus'] ?? repair['status'])
                  ?.toString()
                  .toLowerCase() ??
              '';
          if (status == 'completed' ||
              status == 'delivered' ||
              status == 'cancelled') {
            _completedRepairs.add(repair);
          } else {
            _activeRepairs.add(repair);
          }
        }
      }
    } catch (e) {
      debugPrint('Failed to fetch user repairs: $e');
      _error = 'Failed to load history';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Submit a new repair request
  Future<bool> submitRequest(Map<String, dynamic> data) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      // POST to /api/service-requests (not /api/customer/service-requests which is GET-only)
      final response = await _apiClient.post(
        ApiConfig.serviceRequestsEndpoint,
        data: data,
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        // Refresh history
        fetchUserRepairs();
        return true;
      } else {
        _error = response.data['error'] ?? 'Submission failed';
        return false;
      }
    } catch (e) {
      debugPrint('Submit request error: $e');
      _error = 'Failed to submit request';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
