import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';
import '../data/models/job_ticket_model.dart';

class JobProvider extends ChangeNotifier {
  final DioClient _dioClient;
  
  List<JobTicketModel> _jobs = [];
  bool _isLoading = false;
  String? _error;

  JobProvider(this._dioClient);

  List<JobTicketModel> get jobs => _jobs;
  bool get isLoading => _isLoading;
  String? get error => _error;

  // Fetch Jobs
  Future<void> fetchJobs() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _dioClient.get('/api/job-tickets');
      if (response.statusCode == 200) {
        final List<dynamic> data = response.data;
        _jobs = data.map((json) => JobTicketModel.fromJson(json)).toList();
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

  // Create Job
  Future<bool> createJob(Map<String, dynamic> jobData) async {
    _isLoading = true;
    notifyListeners();
    try {
      final response = await _dioClient.post('/api/job-tickets', data: jobData);
      if (response.statusCode == 201) {
        await fetchJobs(); // Refresh list
        return true;
      }
      return false;
    } on DioException catch (e) {
      _error = e.response?.data['error'] ?? e.response?.data['message'] ?? 'Failed to create job';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // Assign Technician
  Future<bool> assignTechnician(String jobId, String techName) async {
    try {
      // Backend uses PATCH to update technician field
      final response = await _dioClient.patch('/api/job-tickets/$jobId', data: {'technician': techName});
      if (response.statusCode == 200) {
        final index = _jobs.indexWhere((j) => j.id == jobId);
        if (index != -1) {
          // Optimistic update or refresh
           await fetchJobs();
        }
        return true;
      }
      return false;
    } catch (e) {
      print('Assign error: $e');
      return false;
    }
  }

  // Update Status
  Future<bool> updateStatus(String jobId, String status) async {
    try {
      final response = await _dioClient.patch('/api/job-tickets/$jobId', data: {'status': status});
       if (response.statusCode == 200) {
         await fetchJobs();
         return true;
      }
      return false;
    } catch (e) {
       return false;
    }
  }
  // Generic Update
  Future<bool> updateJob(String jobId, Map<String, dynamic> data) async {
    try {
      final response = await _dioClient.patch('/api/job-tickets/$jobId', data: data);
       if (response.statusCode == 200) {
         await fetchJobs();
         return true;
      }
      return false;
    } catch (e) {
       return false;
    }
  }
}
