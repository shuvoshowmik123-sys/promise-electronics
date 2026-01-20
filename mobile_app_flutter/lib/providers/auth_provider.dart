import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../repositories/auth_repository.dart';
import '../services/api_client.dart';
import '../models/warranty.dart';

/// Authentication state
enum AuthState {
  initial, // App just started, checking auth
  checking, // Actively checking if user is authenticated
  authenticated, // User is logged in
  unauthenticated, // User is not logged in
  error, // An error occurred
}

/// Auth Provider
/// Manages authentication state and user data
/// UI -> AuthProvider -> AuthRepository -> ApiClient
class AuthProvider with ChangeNotifier {
  final AuthRepository _repository = AuthRepository();
  final ApiClient _apiClient = ApiClient();

  AuthState _state = AuthState.initial;
  AuthUser? _user;
  String? _error;
  bool _isLoading = false;

  // Getters
  AuthState get state => _state;
  AuthUser? get user => _user;
  String? get error => _error;
  bool get isLoading => _isLoading;
  bool get isAuthenticated => _state == AuthState.authenticated;
  bool get isChecking =>
      _state == AuthState.initial || _state == AuthState.checking;

  /// Initialize auth state - check if user is logged in
  /// Call this on app startup (e.g., in SplashScreen)
  Future<void> initialize() async {
    _state = AuthState.checking;
    notifyListeners();

    // Initialize the API client (cookie storage)
    await _apiClient.initialize();

    // Load local profile image if exists
    final prefs = await SharedPreferences.getInstance();
    final localImage = prefs.getString('local_profile_image');

    final isAuth = await _repository.isAuthenticated();

    if (isAuth) {
      // Try to get current user profile
      final result = await _repository.getCurrentUser();
      if (result.isSuccess && result.data != null) {
        _user = result.data;
        // Override with local image if exists
        if (localImage != null) {
          _user = _user?.copyWith(avatar: localImage);
        }
        _state = AuthState.authenticated;
      } else {
        // Session might be expired
        _state = AuthState.unauthenticated;
      }
    } else {
      _state = AuthState.unauthenticated;
    }

    notifyListeners();
  }

  /// Update profile image locally
  Future<void> updateLocalProfileImage(String path) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('local_profile_image', path);

    if (_user != null) {
      _user = _user?.copyWith(avatar: path);
      notifyListeners();
    }
  }

  /// Remove local profile image
  Future<void> removeLocalProfileImage() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('local_profile_image');

    if (_user != null) {
      // Revert to server avatar if available, or null
      // For now, we'll just reload the user from repo to get fresh state
      // or just set avatar to null if we assume server avatar is also null/overridden
      // A better approach is to re-fetch user, but for now:
      _user = _user?.copyWith(avatar: null);
      // Ideally we should fall back to _repository.getCurrentUser() data
      // but we don't store the "original" server user separately.
      // Let's do a quick refresh:
      refreshUser();
    }
  }

  /// Login with phone and password
  Future<bool> login(String phone, String password) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final result = await _repository.login(phone, password);

    _isLoading = false;

    if (result.isSuccess && result.data != null) {
      _user = result.data;
      _state = AuthState.authenticated;
      _error = null;
      notifyListeners();
      return true;
    } else {
      _error = result.error ?? 'Login failed';
      _state = AuthState.error;
      notifyListeners();
      return false;
    }
  }

  /// Register new account
  Future<bool> register({
    required String name,
    required String phone,
    required String password,
    String? email,
    String? address,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final result = await _repository.register(
      name: name,
      phone: phone,
      password: password,
      email: email,
      address: address,
    );

    _isLoading = false;

    if (result.isSuccess && result.data != null) {
      _user = result.data;
      _state = AuthState.authenticated;
      _error = null;
      notifyListeners();
      return true;
    } else {
      _error = result.error ?? 'Registration failed';
      _state = AuthState.error;
      notifyListeners();
      return false;
    }
  }

  /// Login with Google
  Future<bool> loginWithGoogle() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final result = await _repository.loginWithGoogle();

    _isLoading = false;

    if (result.isSuccess && result.data != null) {
      _user = result.data;
      _state = AuthState.authenticated;
      _error = null;
      notifyListeners();
      return true;
    } else {
      _error = result.error ?? 'Google sign-in failed';
      // Don't change state to error for cancelled sign-in
      if (result.error?.contains('cancelled') != true) {
        _state = AuthState.error;
      }
      notifyListeners();
      return false;
    }
  }

  /// Link Google Account
  Future<bool> linkGoogleAccount() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final result = await _repository.linkGoogleAccount();

    _isLoading = false;

    if (result.isSuccess && result.data != null) {
        // Update local user data with new info (e.g. googleSub implied)
        _user = result.data;
        _error = null;
        notifyListeners();
        return true;
    } else {
        _error = result.error ?? 'Failed to link Google account';
        notifyListeners();
        return false;
    }
  }

  /// Check if profile is complete (phone and address requirements)
  bool get isProfileComplete {
    if (_user == null) return false;
    // We require Phone and Address
    final hasPhone = _user!.phone != null && _user!.phone!.isNotEmpty;
    final hasAddress = _user!.address != null && _user!.address!.isNotEmpty;
    return hasPhone && hasAddress;
  }

  /// Logout
  Future<void> logout() async {
    _isLoading = true;
    notifyListeners();

    await _repository.logout();

    _user = null;
    _state = AuthState.unauthenticated;
    _error = null;
    _isLoading = false;
    notifyListeners();
  }

  /// Change password
  Future<bool> changePassword(
      String currentPassword, String newPassword) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final result =
        await _repository.changePassword(currentPassword, newPassword);

    _isLoading = false;

    if (result.isSuccess) {
      _error = null;
      notifyListeners();
      return true;
    } else {
      _error = result.error ?? 'Failed to change password';
      notifyListeners();
      return false;
    }
  }

  /// Update profile
  Future<bool> updateProfile({
    String? name,
    String? phone,
    String? address,
    String? email,
    String? profileImageUrl,
  }) async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    final result = await _repository.updateProfile(
      name: name,
      phone: phone,
      address: address,
      email: email,
      profileImageUrl: profileImageUrl,
    );

    _isLoading = false;

    if (result.isSuccess && result.data != null) {
      _user = result.data;
      _error = null;
      notifyListeners();
      return true;
    } else {
      _error = result.error ?? 'Failed to update profile';
      notifyListeners();
      return false;
    }
  }

  /// Get warranties
  Future<List<Warranty>> getWarranties() async {
    final result = await _repository.getWarranties();
    if (result.isSuccess && result.data != null) {
      return result.data!;
    }
    return [];
  }

  /// Refresh user data
  Future<void> refreshUser() async {
    if (!isAuthenticated) return;

    final result = await _repository.getCurrentUser();

    if (result.isSuccess && result.data != null) {
      _user = result.data;
      notifyListeners();
    } else if (result.error?.contains('log in') == true ||
        result.error?.contains('session') == true) {
      // Session expired or needs re-authentication, logout
      await logout();
    }
  }

  /// Clear error state
  void clearError() {
    _error = null;
    if (_state == AuthState.error) {
      _state = AuthState.unauthenticated;
    }
    notifyListeners();
  }
}
