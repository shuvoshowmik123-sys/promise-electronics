import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';

class AttendanceProvider extends ChangeNotifier {
  final DioClient _dioClient;
  bool _isLoading = false;
  List<dynamic> _records = [];
  dynamic _todayRecord;
  String? _error;

  AttendanceProvider(this._dioClient);

  bool get isLoading => _isLoading;
  List<dynamic> get records => _records;
  dynamic get todayRecord => _todayRecord;
  String? get error => _error;

  // For Super Admin: Fetch all records
  Future<void> fetchAllRecords() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _dioClient.get('/api/admin/attendance');
      if (response.statusCode == 200) {
        _records = response.data is List ? response.data : [];
        // Sort by date descending
        _records.sort((a, b) {
            final dateA = DateTime.tryParse(a['date'] ?? '') ?? DateTime(2000);
            final dateB = DateTime.tryParse(b['date'] ?? '') ?? DateTime(2000);
            return dateB.compareTo(dateA); 
        });
      }
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to load attendance records';
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // For Staff: Fetch their own history
  Future<void> fetchUserRecords(String userId) async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      final response = await _dioClient.get('/api/admin/attendance/user/$userId');
      if (response.statusCode == 200) {
        _records = response.data is List ? response.data : [];
        _records.sort((a, b) {
            final dateA = DateTime.tryParse(a['date'] ?? '') ?? DateTime(2000);
            final dateB = DateTime.tryParse(b['date'] ?? '') ?? DateTime(2000);
            return dateB.compareTo(dateA); 
        });
      }
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Failed to load history';
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // For Staff: Fetch today's status
  Future<void> fetchTodayStatus() async {
    try {
      final response = await _dioClient.get('/api/admin/attendance/today');
      if (response.statusCode == 200) {
        _todayRecord = response.data;
        notifyListeners();
      }
    } catch (e) {
      // Ignore error for status check, might just return null
      print("Error fetching today status: $e");
    }
  }

  // Check In
  Future<bool> checkIn(String? notes) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _dioClient.post('/api/admin/attendance/check-in', data: {
        'notes': notes,
      });
      if (response.statusCode == 201) {
        _todayRecord = response.data;
        return true;
      }
      return false;
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Check-in failed';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Check Out
  Future<bool> checkOut() async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _dioClient.post('/api/admin/attendance/check-out');
      if (response.statusCode == 200) {
        _todayRecord = response.data;
        return true;
      }
      return false;
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Check-out failed';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
