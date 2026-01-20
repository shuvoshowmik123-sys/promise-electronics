import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';

/// Personal stats for the logged-in technician
class TechnicianStats {
  final int assigned;
  final int completed;
  final int pending;
  final int inProgress;

  TechnicianStats({
    required this.assigned,
    required this.completed,
    required this.pending,
    required this.inProgress,
  });

  factory TechnicianStats.fromJson(Map<String, dynamic> json) {
    return TechnicianStats(
      assigned: json['assigned'] ?? 0,
      completed: json['completed'] ?? 0,
      pending: json['pending'] ?? 0,
      inProgress: json['inProgress'] ?? 0,
    );
  }

  factory TechnicianStats.empty() {
    return TechnicianStats(assigned: 0, completed: 0, pending: 0, inProgress: 0);
  }
}

/// Job with pending days calculation
class TechnicianJob {
  final String id;
  final String device;
  final String? screenSize;
  final String status;
  final String? customerName;
  final String? phone;
  final String? issue;
  final DateTime? createdAt;
  final DateTime? deadline;
  final int pendingDays;

  TechnicianJob({
    required this.id,
    required this.device,
    this.screenSize,
    required this.status,
    this.customerName,
    this.phone,
    this.issue,
    this.createdAt,
    this.deadline,
    required this.pendingDays,
  });

  factory TechnicianJob.fromJson(Map<String, dynamic> json) {
    return TechnicianJob(
      id: json['id'] ?? '',
      device: json['device'] ?? 'Unknown Device',
      screenSize: json['screenSize'],
      status: json['status'] ?? 'Pending',
      customerName: json['customerName'],
      phone: json['phone'],
      issue: json['issue'],
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt']) : null,
      deadline: json['deadline'] != null ? DateTime.tryParse(json['deadline']) : null,
      pendingDays: json['pendingDays'] ?? 0,
    );
  }
}

/// Provider for Technician's personal dashboard data
class TechnicianProvider extends ChangeNotifier {
  final DioClient _dioClient;

  TechnicianStats _stats = TechnicianStats.empty();
  List<TechnicianJob> _myJobs = [];
  bool _isLoading = false;
  String? _error;

  TechnicianProvider(this._dioClient);

  // Getters
  TechnicianStats get stats => _stats;
  List<TechnicianJob> get myJobs => _myJobs;
  List<TechnicianJob> get pendingJobs => _myJobs.where((j) => 
      j.status != 'Completed' && j.status != 'Delivered' && j.status != 'Cancelled').toList();
  bool get isLoading => _isLoading;
  String? get error => _error;

  /// Fetch personal stats from /api/technician/stats
  Future<void> fetchMyStats() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _dioClient.get('/api/technician/stats');
      if (response.statusCode == 200) {
        _stats = TechnicianStats.fromJson(response.data);
      }
    } on DioException catch (e) {
      _error = e.response?.data['error'] ?? 'Failed to load stats';
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Fetch personal jobs from /api/technician/jobs
  /// [status] can be 'all', 'pending', or 'completed'
  Future<void> fetchMyJobs({String status = 'all'}) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _dioClient.get('/api/technician/jobs?status=$status');
      if (response.statusCode == 200) {
        final List<dynamic> data = response.data;
        _myJobs = data.map((json) => TechnicianJob.fromJson(json)).toList();
      }
    } on DioException catch (e) {
      _error = e.response?.data['error'] ?? 'Failed to load jobs';
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Refresh all data
  Future<void> refreshAll() async {
    await Future.wait([
      fetchMyStats(),
      fetchMyJobs(),
    ]);
  }
}
