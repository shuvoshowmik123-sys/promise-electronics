import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';

class ChallanProvider extends ChangeNotifier {
  final DioClient _dioClient;
  bool _isLoading = false;
  List<dynamic> _challans = [];
  String? _error;

  ChallanProvider(this._dioClient);

  bool get isLoading => _isLoading;
  List<dynamic> get challans => _challans;
  String? get error => _error;

  Future<void> fetchChallans() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      // Assuming endpoint is /api/challans
      // If backend doesn't exist, this will error. 
      // We will assume backend parity or fail gracefully.
      final response = await _dioClient.get('/api/challans');
      
      if (response.statusCode == 200) {
        final data = response.data;
        if (data is List) {
          _challans = data;
        } else if (data is Map && data['data'] is List) {
          _challans = data['data'];
        } else {
          _challans = [];
        }
      }
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to load challans';
      // Fallback empty if 404 (endpoint not exists)
      if (e.response?.statusCode == 404) {
        _challans = []; // Treat as empty
      }
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> createChallan(Map<String, dynamic> data) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _dioClient.post('/api/challans', data: data);
      if (response.statusCode == 200 || response.statusCode == 201) {
        await fetchChallans();
        return true;
      }
      return false;
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to create challan';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
