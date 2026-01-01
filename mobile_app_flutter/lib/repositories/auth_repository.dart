import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:google_sign_in/google_sign_in.dart';
import '../services/api_client.dart';
import '../models/warranty.dart';

/// Result wrapper for repository operations
class Result<T> {
  final T? data;
  final String? error;
  final bool isSuccess;

  Result.success(this.data)
      : error = null,
        isSuccess = true;

  Result.failure(this.error)
      : data = null,
        isSuccess = false;
}

/// User data returned from auth operations
class AuthUser {
  final String id;
  final String? email;
  final String? name;
  final String? phone;
  final String? avatar;
  final String role;
  final String? address;

  AuthUser({
    required this.id,
    this.email,
    this.name,
    this.phone,
    this.avatar,
    this.role = 'Customer',
    this.address,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id']?.toString() ?? '',
      email: json['email']?.toString(),
      name: json['name']?.toString(),
      phone: json['phone']?.toString(),
      avatar: json['profileImageUrl']?.toString() ?? json['avatar']?.toString(),
      role: json['role']?.toString() ?? 'Customer',
      address: json['address']?.toString(),
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'name': name,
        'phone': phone,
        'avatar': avatar,
        'role': role,
        'address': address,
      };

  AuthUser copyWith({
    String? id,
    String? email,
    String? name,
    String? phone,
    String? avatar,
    String? role,
    String? address,
  }) {
    return AuthUser(
      id: id ?? this.id,
      email: email ?? this.email,
      name: name ?? this.name,
      phone: phone ?? this.phone,
      avatar: avatar ?? this.avatar,
      role: role ?? this.role,
      address: address ?? this.address,
    );
  }
}

/// Auth Repository
/// Handles all authentication operations
/// Uses session-based auth (cookies) to match backend
class AuthRepository {
  final ApiClient _client = ApiClient();

  // Google Client ID from Google Cloud Console
  static const String _webClientId =
      '158965145454-4mi8aafaqrm6b2tfkn5qum2epin3lk4j.apps.googleusercontent.com';

  GoogleSignIn? _googleSignIn;

  GoogleSignIn get googleSignIn {
    _googleSignIn ??= GoogleSignIn(
      scopes: ['email', 'profile'],
      // For web: use clientId
      // For native: use serverClientId to get idToken
      clientId: kIsWeb ? _webClientId : null,
      serverClientId: kIsWeb ? null : _webClientId,
    );
    return _googleSignIn!;
  }

  /// Login with phone and password
  /// Backend: POST /api/customer/login
  Future<Result<AuthUser>> login(String phone, String password) async {
    try {
      final response = await _client.post(
        '/api/customer/login',
        data: {
          'phone': phone,
          'password': password,
        },
      );

      if (response.statusCode == 200 && response.data != null) {
        // Session cookie is automatically stored by CookieManager
        final user = AuthUser.fromJson(response.data as Map<String, dynamic>);
        return Result.success(user);
      }

      return Result.failure('Login failed. Please try again.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Login error: $e');
      return Result.failure('An unexpected error occurred.');
    }
  }

  /// Register a new account
  /// Backend: POST /api/customer/register
  Future<Result<AuthUser>> register({
    required String name,
    required String phone,
    required String password,
    String? email,
    String? address,
  }) async {
    try {
      final response = await _client.post(
        '/api/customer/register',
        data: {
          'name': name,
          'phone': phone,
          'password': password,
          if (email != null && email.isNotEmpty) 'email': email,
          if (address != null && address.isNotEmpty) 'address': address,
        },
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        // Session cookie is automatically stored by CookieManager
        final user = AuthUser.fromJson(response.data as Map<String, dynamic>);
        return Result.success(user);
      }

      return Result.failure('Registration failed. Please try again.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Register error: $e');
      return Result.failure('An unexpected error occurred.');
    }
  }

  /// Login with Google (native)
  /// Backend: POST /api/customer/google/native-login
  Future<Result<AuthUser>> loginWithGoogle() async {
    try {
      // Trigger Google Sign-In flow
      final googleUser = await googleSignIn.signIn();

      if (googleUser == null) {
        return Result.failure('Google sign-in was cancelled.');
      }

      // Get auth tokens
      final googleAuth = await googleUser.authentication;
      final idToken = googleAuth.idToken;

      if (idToken == null) {
        return Result.failure('Failed to get Google credentials.');
      }

      // Send to backend for verification and session creation
      final response = await _client.post(
        '/api/customer/google/native-login',
        data: {
          'idToken': idToken,
        },
      );

      if (response.statusCode == 200 && response.data != null) {
        final data = response.data as Map<String, dynamic>;

        // Parse user from response
        final userData = data['user'] ??
            {
              'id': googleUser.id,
              'email': googleUser.email,
              'name': googleUser.displayName,
              'profileImageUrl': googleUser.photoUrl,
            };
        final user = AuthUser.fromJson(userData);

        return Result.success(user);
      }

      return Result.failure('Google login failed. Please try again.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Google login error: $e');
      return Result.failure('Google sign-in failed. Please try again.');
    }
  }

  /// Get current user from session
  /// Backend: GET /api/customer/me or GET /api/customer/auth/me
  Future<Result<AuthUser>> getCurrentUser() async {
    try {
      final hasSession = await _client.hasSession();
      if (!hasSession) {
        return Result.failure('Not authenticated');
      }

      // Try the auth/me endpoint first (works for both Google and phone auth)
      try {
        final response = await _client.get('/api/customer/auth/me');
        if (response.statusCode == 200 && response.data != null) {
          final user = AuthUser.fromJson(response.data as Map<String, dynamic>);
          return Result.success(user);
        }
      } catch (e) {
        // Fall back to /api/customer/me
        debugPrint('auth/me failed, trying /me: $e');
      }

      final response = await _client.get('/api/customer/me');
      if (response.statusCode == 200 && response.data != null) {
        final user = AuthUser.fromJson(response.data as Map<String, dynamic>);
        return Result.success(user);
      }

      return Result.failure('Failed to fetch user profile.');
    } on DioException catch (e) {
      // If 401, session is invalid
      if (e.response?.statusCode == 401) {
        await logout();
        // Get meaningful message from error if available
        String message = 'Please log in to continue.';
        if (e.error is AuthException) {
          message = (e.error as AuthException).message;
        }
        return Result.failure(message);
      }
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Get current user error: $e');
      return Result.failure('Failed to fetch user profile.');
    }
  }

  /// Logout - clear cookies and sign out of Google
  /// Backend: POST /api/customer/logout
  Future<void> logout() async {
    try {
      // Try to logout on server
      await _client.post('/api/customer/logout');
    } catch (e) {
      debugPrint('Server logout error (may be expected): $e');
    }

    // Always clear local session
    try {
      await googleSignIn.signOut();
    } catch (e) {
      debugPrint('Google sign out error: $e');
    }
    await _client.clearSession();
  }

  /// Change password
  /// Backend: POST /api/customer/change-password
  Future<Result<void>> changePassword(
      String currentPassword, String newPassword) async {
    try {
      final response = await _client.post(
        '/api/customer/change-password',
        data: {
          'currentPassword': currentPassword,
          'newPassword': newPassword,
        },
      );

      if (response.statusCode == 200) {
        return Result.success(null);
      }

      return Result.failure('Failed to change password.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Change password error: $e');
      return Result.failure('An unexpected error occurred.');
    }
  }

  /// Update user profile
  /// Backend: PUT /api/customer/profile
  Future<Result<AuthUser>> updateProfile({
    String? name,
    String? phone,
    String? address,
    String? email,
    String? profileImageUrl,
  }) async {
    try {
      final data = <String, dynamic>{};
      if (name != null) data['name'] = name;
      if (phone != null) data['phone'] = phone;
      if (address != null) data['address'] = address;
      if (email != null) data['email'] = email;
      if (profileImageUrl != null) data['profileImageUrl'] = profileImageUrl;

      final response = await _client.put(
        '/api/customer/profile',
        data: data,
      );

      if (response.statusCode == 200 && response.data != null) {
        final user = AuthUser.fromJson(response.data as Map<String, dynamic>);
        return Result.success(user);
      }

      return Result.failure('Failed to update profile.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Update profile error: $e');
      return Result.failure('An unexpected error occurred.');
    }
  }

  /// Get customer warranties
  /// Backend: GET /api/customer/warranties
  Future<Result<List<Warranty>>> getWarranties() async {
    try {
      final response = await _client.get('/api/customer/warranties');

      if (response.statusCode == 200 && response.data != null) {
        final list = (response.data as List)
            .map((e) => Warranty.fromJson(e as Map<String, dynamic>))
            .toList();
        return Result.success(list);
      }

      return Result.failure('Failed to fetch warranties.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Get warranties error: $e');
      return Result.failure('An unexpected error occurred.');
    }
  }

  /// Check if user is authenticated (has session cookies)
  Future<bool> isAuthenticated() async {
    return await _client.hasSession();
  }

  /// Handle Dio errors and return user-friendly messages
  Result<T> _handleDioError<T>(DioException e) {
    if (e.error is AuthException) {
      return Result.failure((e.error as AuthException).message);
    }
    if (e.error is ApiException) {
      return Result.failure((e.error as ApiException).message);
    }

    // Handle response errors
    if (e.response != null) {
      final data = e.response?.data;
      if (data is Map<String, dynamic>) {
        final message = data['message'] ?? data['error'];
        if (message != null) {
          return Result.failure(message.toString());
        }
      }

      // Common HTTP errors
      switch (e.response?.statusCode) {
        case 400:
          return Result.failure('Invalid request. Please check your input.');
        case 401:
          return Result.failure('Invalid credentials.');
        case 403:
          return Result.failure('Access denied.');
        case 404:
          return Result.failure('Service not found.');
        case 409:
          return Result.failure('This account already exists.');
        case 422:
          return Result.failure('Invalid data. Please check your input.');
        case 429:
          return Result.failure('Too many requests. Please wait a moment.');
        case 500:
          return Result.failure('Server error. Please try again later.');
      }
    }

    // Network errors
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return Result.failure('Connection timeout. Please try again.');
      case DioExceptionType.connectionError:
        return Result.failure('No internet connection.');
      default:
        return Result.failure('Something went wrong. Please try again.');
    }
  }
}
