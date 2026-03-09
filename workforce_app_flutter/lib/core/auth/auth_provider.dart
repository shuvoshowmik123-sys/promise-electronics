import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../../shared/models/user_model.dart';
import '../api/api_client.dart';
import '../storage/secure_storage.dart';

enum AuthStatus {
  initial,
  unauthenticated,
  authenticating,
  authenticated,
  error,
}

class AuthProvider extends ChangeNotifier {
  final ApiClient _apiClient;
  final SecureStorage _secureStorage;

  UserModel? _user;
  AuthStatus _status = AuthStatus.initial;
  String? _errorMessage;

  AuthProvider(this._apiClient, this._secureStorage);

  UserModel? get user => _user;
  AuthStatus get status => _status;
  String? get errorMessage => _errorMessage;
  bool get isAuthenticated => _status == AuthStatus.authenticated;

  Future<void> init() async {
    // Check if we have a saved session or try to bootstrap
    try {
      final response = await _apiClient.client.get(ApiEndpoints.bootstrap);
      if (response.statusCode == 200 && response.data['user'] != null) {
        _user = UserModel.fromJson(response.data['user']);
        _status = AuthStatus.authenticated;
      } else {
        _status = AuthStatus.unauthenticated;
      }
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        _status = AuthStatus.unauthenticated;
      } else {
        _status = AuthStatus.error;
        _errorMessage =
            _extractErrorMessage(e.response?.data) ??
            'Network error during initialization';
      }
    } catch (e) {
      _status = AuthStatus.error;
      _errorMessage = 'An unexpected error occurred';
    }
    notifyListeners();
  }

  Future<bool> login(String username, String password) async {
    _status = AuthStatus.authenticating;
    _errorMessage = null;
    notifyListeners();

    try {
      // 1. Call standard admin login which sets the connect.sid cookie
      final loginResponse = await _apiClient.client.post(
        ApiEndpoints.login,
        data: {'username': username, 'password': password},
      );

      if (loginResponse.statusCode == 200) {
        // 2. Clear previous cached data
        await _secureStorage.clearAll();

        // 3. Instead of returning the user directly, we bootstrap
        // to get the full mobile context (modules, location, etc.)
        final bootstrapResponse = await _apiClient.client.get(
          ApiEndpoints.bootstrap,
        );

        if (bootstrapResponse.statusCode == 200 &&
            bootstrapResponse.data['user'] != null) {
          _user = UserModel.fromJson(bootstrapResponse.data['user']);

          // Optionally save tokens/preferences to secure storage if needed
          await _secureStorage.saveString(
            'last_login_user',
            _user!.displayName,
          );

          _status = AuthStatus.authenticated;
          notifyListeners();
          return true;
        }

        _status = AuthStatus.unauthenticated;
        _errorMessage =
            _extractErrorMessage(bootstrapResponse.data) ??
            'Login succeeded but profile could not be loaded.';
        notifyListeners();
        return false;
      }

      _status = AuthStatus.unauthenticated;
      _errorMessage = 'Invalid username or password';
      notifyListeners();
      return false;
    } on DioException catch (e) {
      _status = AuthStatus.unauthenticated;
      final backendError = _extractErrorMessage(e.response?.data);
      if (e.response?.statusCode == 401 || e.response?.statusCode == 403) {
        _errorMessage = backendError ?? 'Invalid username or password';
      } else {
        _errorMessage =
            backendError ?? 'Network error. Please check your connection.';
      }
      notifyListeners();
      return false;
    } catch (e) {
      _status = AuthStatus.unauthenticated;
      _errorMessage = 'An unexpected error occurred';
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    try {
      await _apiClient.client.post(ApiEndpoints.logout);
    } catch (e) {
      // Ignore network errors on logout, just clear local state
    } finally {
      await _apiClient.clearCookies();
      await _secureStorage.clearAll();
      _user = null;
      _status = AuthStatus.unauthenticated;
      notifyListeners();
    }
  }

  String? _extractErrorMessage(dynamic data) {
    if (data is Map<String, dynamic>) {
      final error = data['error'];
      if (error is String && error.trim().isNotEmpty) {
        return error.trim();
      }

      final message = data['message'];
      if (message is String && message.trim().isNotEmpty) {
        return message.trim();
      }
    }

    return null;
  }
}
