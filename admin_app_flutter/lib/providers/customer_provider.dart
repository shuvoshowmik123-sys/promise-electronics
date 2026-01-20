import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';

class CustomerProvider extends ChangeNotifier {
  final DioClient _dioClient;
  bool _isLoading = false;
  List<dynamic> _customers = [];
  String? _error;

  CustomerProvider(this._dioClient);

  bool get isLoading => _isLoading;
  List<dynamic> get customers => _customers;
  String? get error => _error;

  Future<void> fetchCustomers() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      // Assuming endpoint is /api/customers based on route file name
      final response = await _dioClient.get('/api/admin/customers');
      
      if (response.statusCode == 200) {
        final data = response.data;
        if (data is List) {
          _customers = data;
        } else if (data is Map && data['data'] is List) {
          _customers = data['data'];
        } else {
          _customers = [];
        }
      }
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to load customers';
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>?> searchByPhone(String phone) async {
    if (_customers.isEmpty) await fetchCustomers();
    
    try {
      final customer = _customers.firstWhere(
        (c) => c['phone']?.toString().contains(phone) == true,
      );
      return customer;
    } catch (e) {
      return null;
    }
  }
}
