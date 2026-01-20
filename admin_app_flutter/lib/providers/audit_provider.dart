import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';
import '../data/models/audit_log_model.dart';

class AuditProvider extends ChangeNotifier {
  final DioClient _dioClient;
  
  List<AuditLog> _logs = [];
  bool _isLoading = false;
  String? _error;

  AuditProvider(this._dioClient);

  List<AuditLog> get logs => _logs;
  bool get isLoading => _isLoading;
  String? get error => _error;

  Future<void> fetchLogs({String? userId, String? entity, int limit = 100}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _dioClient.get(
        '/api/audit-logs',
        queryParameters: {
            if (userId != null && userId.isNotEmpty) 'userId': userId,
            if (entity != null && entity.isNotEmpty) 'entity': entity,
            'limit': limit,
        }
      );
      if (response.statusCode == 200) {
        final List<dynamic> data = response.data;
        _logs = data.map((json) => AuditLog.fromJson(json)).toList();
      }
    } on DioException catch (e) {
      _error = e.response?.data['error'] ?? 'Failed to load logs';
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
