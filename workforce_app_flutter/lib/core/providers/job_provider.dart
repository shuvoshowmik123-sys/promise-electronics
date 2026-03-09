import 'package:flutter/material.dart';
import '../../features/jobs/models/job_model.dart';
import '../api/api_client.dart';

enum JobProviderStatus { initial, loading, loaded, error }

class JobProvider extends ChangeNotifier {
  final ApiClient _apiClient;

  List<JobModel> _jobs = [];
  JobModel? _selectedJob;
  
  JobProviderStatus _status = JobProviderStatus.initial;
  String? _errorMessage;

  JobProvider(this._apiClient);

  List<JobModel> get jobs => _jobs;
  JobModel? get selectedJob => _selectedJob;
  JobProviderStatus get status => _status;
  String? get errorMessage => _errorMessage;

  Future<void> fetchJobs({String? statusId, String? search}) async {
    _status = JobProviderStatus.loading;
    _errorMessage = null;
    notifyListeners();

    try {
      final queryParams = <String, dynamic>{};
      if (statusId != null && statusId.isNotEmpty) queryParams['status'] = statusId;
      if (search != null && search.isNotEmpty) queryParams['search'] = search;

      final response = await _apiClient.client.get(
        ApiEndpoints.jobs,
        queryParameters: queryParams,
      );

      final List data = response.data['data'] ?? response.data ?? [];
      _jobs = data.map((json) => JobModel.fromJson(json)).toList();
      _status = JobProviderStatus.loaded;
    } catch (e) {
      _status = JobProviderStatus.error;
      _errorMessage = e.toString();
    }
    notifyListeners();
  }

  Future<void> fetchJobDetail(String id) async {
    _status = JobProviderStatus.loading;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _apiClient.client.get(ApiEndpoints.jobDetail(id));
      _selectedJob = JobModel.fromJson(response.data);
      _status = JobProviderStatus.loaded;
    } catch (e) {
      _status = JobProviderStatus.error;
      _errorMessage = e.toString();
    }
    notifyListeners();
  }

  Future<bool> updateJobStatus(String id, String newStatusId) async {
    try {
      await _apiClient.client.put(
        ApiEndpoints.jobStatus(id),
        data: {'status': newStatusId},
      );
      // Refresh details and list
      await fetchJobDetail(id);
      fetchJobs();
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<bool> addJobNote(String id, String noteText, {String? mediaPath}) async {
    try {
      // Basic text note for now. Multipart required for media.
      await _apiClient.client.post(
        ApiEndpoints.jobNote(id),
        data: {'text': noteText},
      );
      await fetchJobDetail(id);
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }
}
