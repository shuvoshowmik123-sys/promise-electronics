import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';

class ServiceRequestProvider extends ChangeNotifier {
  final DioClient _dioClient;
  bool _isLoading = false;
  List<dynamic> _requests = [];
  String? _error;

  ServiceRequestProvider(this._dioClient);

  bool get isLoading => _isLoading;
  List<dynamic> get requests => _requests;
  String? get error => _error;

  Future<void> fetchRequests() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      // Endpoint matches server/routes/service-requests.routes.ts
      final response = await _dioClient.get('/api/service-requests');
      
      if (response.statusCode == 200) {
        // Handle various response formats (list directly or wrapped in data)
        final data = response.data;
        if (data is List) {
          _requests = data;
        } else if (data is Map && data['data'] is List) {
          _requests = data['data'];
        } else {
          _requests = [];
        }
      }
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to load service requests';
      print('Error fetching requests: $_error');
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> updateRequest(String id, Map<String, dynamic> data) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _dioClient.patch('/api/service-requests/$id', data: data);
      if (response.statusCode == 200) {
        // Refresh list to reflect changes (e.g. status change)
        await fetchRequests(); 
        return true;
      }
      return false;
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to update request';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
  Color getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'pending': return Colors.orange;
      case 'in_progress': return Colors.blue;
      case 'completed': return Colors.green;
      case 'cancelled': return Colors.red;
      default: return Colors.grey;
    }
  }
  Future<bool> createRequest(Map<String, dynamic> data) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _dioClient.post('/api/service-requests', data: data);
      if (response.statusCode == 200 || response.statusCode == 201) {
        await fetchRequests(); // Refresh list
        return true;
      }
      return false;
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to create request';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
