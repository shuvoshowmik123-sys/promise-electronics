import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';

class UserProvider extends ChangeNotifier {
  final DioClient _dioClient;
  bool _isLoading = false;
  List<dynamic> _users = [];
  String? _error;

  UserProvider(this._dioClient);

  bool get isLoading => _isLoading;
  List<dynamic> get users => _users;
  String? get error => _error;

  List<dynamic> get technicians => _users.where((user) {
    final role = (user['role'] ?? '').toString().toLowerCase();
    return role == 'technician' || role == 'tech';
  }).toList();

  Future<void> fetchUsers() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _dioClient.get('/api/users');
      
      if (response.statusCode == 200) {
        final data = response.data;
        if (data is List) {
          _users = data;
        } else if (data is Map && data['data'] is List) {
          _users = data['data'];
        } else {
          _users = [];
        }
      }
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to load users';
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> addUser(Map<String, dynamic> data) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _dioClient.post('/api/admin/users', data: data);
      if (response.statusCode == 200 || response.statusCode == 201) {
        await fetchUsers(); // Refresh list
        return true;
      }
      return false;
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to add user';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
