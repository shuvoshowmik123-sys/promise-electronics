import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';

class DashboardProvider extends ChangeNotifier {
  final DioClient _dioClient;
  bool _isLoading = false;
  Map<String, dynamic>? _stats;
  String? _error;

  DashboardProvider(this._dioClient);

  bool get isLoading => _isLoading;
  Map<String, dynamic>? get stats => _stats;
  String? get error => _error;

  // Getters for specific stats with fail-safe defaults
  String get activeJobs => _stats?['activeJobs']?.toString() ?? '0';
  String get revenue => _stats?['revenue']?.toString() ?? '0'; // Or format currency
  String get activeTechs => _stats?['activeTechs']?.toString() ?? '0';
  String get lowStockItems => _stats?['lowStock']?.toString() ?? '0';

  Future<void> fetchStats() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      // Assuming endpoint is /api/admin/dashboard-stats
      final response = await _dioClient.get('/api/admin/dashboard');
      
      if (response.statusCode == 200) {
        final data = response.data;
        // Adjust based on actual API response structure
        if (data is Map<String, dynamic>) {
           _stats = data;
        } else {
           // Handle if wrapped in 'data'
           _stats = data['data'] ?? {}; 
        }
      }
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to load stats';
      print('Error fetching stats: $_error');
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
