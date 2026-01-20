import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';

class InventoryProvider extends ChangeNotifier {
  final DioClient _dioClient;
  bool _isLoading = false;
  List<dynamic> _products = [];
  String? _error;

  InventoryProvider(this._dioClient);

  bool get isLoading => _isLoading;
  List<dynamic> get products => _products;
  String? get error => _error;

  Future<void> fetchProducts() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      // Assuming endpoint is /api/inventory based on route file name
      final response = await _dioClient.get('/api/inventory');
      
      if (response.statusCode == 200) {
        final data = response.data;
        if (data is List) {
          _products = data;
        } else if (data is Map && data['data'] is List) {
          _products = data['data'];
        } else {
          _products = [];
        }
      }
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to load inventory';
      // print('Error fetching inventory: $_error');
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> updateStock(String id, int newQuantity) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _dioClient.patch('/api/inventory/$id/stock', data: {'quantity': newQuantity});
      if (response.statusCode == 200) {
        // Update local list if exists
        final index = _products.indexWhere((p) => p['id'] == id);
        if (index != -1) {
          _products[index]['stock'] = newQuantity;
        }
        return true;
      }
      return false;
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to update stock';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> addProduct(Map<String, dynamic> data) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _dioClient.post('/api/inventory', data: data);
      if (response.statusCode == 200 || response.statusCode == 201) {
        await fetchProducts(); // Refresh list
        return true;
      }
      return false;
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to add product';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
