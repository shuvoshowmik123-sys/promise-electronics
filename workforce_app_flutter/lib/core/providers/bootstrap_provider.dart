import 'package:flutter/material.dart';
import '../../shared/models/bootstrap_model.dart';
import '../api/api_client.dart';

enum BootstrapStatus { initial, loading, loaded, error }

class BootstrapProvider extends ChangeNotifier {
  final ApiClient _apiClient;

  BootstrapModel? _data;
  BootstrapStatus _status = BootstrapStatus.initial;
  String? _errorMessage;

  BootstrapProvider(this._apiClient);

  BootstrapModel? get data => _data;
  BootstrapStatus get status => _status;
  String? get errorMessage => _errorMessage;

  Future<void> loadBootstrap() async {
    _status = BootstrapStatus.loading;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _apiClient.client.get(ApiEndpoints.bootstrap);
      _data = BootstrapModel.fromJson(response.data);
      _status = BootstrapStatus.loaded;
    } catch (e) {
      _status = BootstrapStatus.error;
      _errorMessage = e.toString();
    }
    notifyListeners();
  }
}
