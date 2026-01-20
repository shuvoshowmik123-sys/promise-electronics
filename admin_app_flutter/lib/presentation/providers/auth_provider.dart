import 'package:flutter/foundation.dart';
import '../../data/models/user_model.dart';
import '../../data/services/api_service.dart';

class AuthProvider extends ChangeNotifier {
  final ApiService _apiService;
  UserModel? _user;
  bool _isLoading = true;
  bool _isInitializing = true;
  String? _error;

  AuthProvider(this._apiService);

  UserModel? get user => _user;
  bool get isLoading => _isLoading;
  bool get isInitializing => _isInitializing;
  String? get error => _error;
  bool get isAuthenticated => _user != null;

  Future<void> checkAuth() async {
    _isInitializing = true;
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final userData = await _apiService.getCurrentUser();
      if (userData != null) {
        _user = UserModel.fromJson(userData);
      } else {
        _user = null;
      }
    } catch (e) {
      debugPrint('Auth check error: $e');
      _user = null;
      // Don't set error here as it might just be network issue or first load
    } finally {
      _isLoading = false;
      _isInitializing = false;
      notifyListeners();
    }
  }

  Future<bool> login(String username, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final userData = await _apiService.login(username, password);
      _user = UserModel.fromJson(userData);
      return true;
    } catch (e) {
      debugPrint('Login error: $e');
      _error = 'Invalid username or password'; // Simplify error message
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> logout() async {
    _isLoading = true;
    notifyListeners();
    
    try {
      await _apiService.logout();
    } finally {
      _user = null;
      _isLoading = false;
      notifyListeners();
    }
  }
}
