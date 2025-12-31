import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../config/api_config.dart';

// Conditional imports for cookie management (not available on web)
import 'cookie_manager_stub.dart' if (dart.library.io) 'cookie_manager_io.dart';

/// Custom exception for authentication errors
class AuthException implements Exception {
  final String message;
  final int? statusCode;

  AuthException(this.message, {this.statusCode});

  @override
  String toString() => 'AuthException: $message (status: $statusCode)';
}

/// Custom exception for API errors
class ApiException implements Exception {
  final String message;
  final int? statusCode;
  final dynamic data;

  ApiException(this.message, {this.statusCode, this.data});

  @override
  String toString() => 'ApiException: $message (status: $statusCode)';
}

/// Singleton API Client using Dio with interceptors
/// Handles cookie-based session auth, logging, and error handling
class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;

  late final Dio _dio;
  bool _initialized = false;

  // Cookie manager instance (null on web)
  CookieManagerWrapper? _cookieManager;

  ApiClient._internal() {
    _dio = Dio(BaseOptions(
      baseUrl: ApiConfig.baseUrl,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 15),
      sendTimeout: const Duration(seconds: 15),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      // Important for web: credentials need to be included
      extra: {'withCredentials': true},
    ));

    // Add base interceptors
    _dio.interceptors.addAll([
      _LoggingInterceptor(),
      _ErrorInterceptor(),
    ]);
  }

  /// Initialize - set up cookie management (only on native platforms)
  Future<void> initialize() async {
    if (_initialized) return;

    try {
      _cookieManager = await createCookieManager();
      if (_cookieManager != null) {
        _dio.interceptors.insert(0, _cookieManager!.interceptor);
        debugPrint('ApiClient initialized with cookie management');
      } else {
        debugPrint('ApiClient initialized without cookies (web platform)');
      }
    } catch (e) {
      debugPrint('Failed to initialize cookie management: $e');
    }

    _initialized = true;
  }

  /// Get the Dio instance for direct access if needed
  Dio get dio => _dio;

  /// Check if user has a session (cookies exist for our domain)
  Future<bool> hasSession() async {
    if (_cookieManager == null) {
      // On web, always return false - sessions handled by browser
      return false;
    }
    try {
      return await _cookieManager!.hasSession(ApiConfig.baseUrl);
    } catch (e) {
      return false;
    }
  }

  /// Clear all cookies (for logout)
  Future<void> clearSession() async {
    if (_cookieManager == null) return;
    try {
      await _cookieManager!.clearAll();
    } catch (e) {
      debugPrint('Error clearing cookies: $e');
    }
  }

  // ============ HTTP Methods ============

  /// GET request
  Future<Response<T>> get<T>(
    String path, {
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _dio.get<T>(
      path,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }

  /// POST request
  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _dio.post<T>(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }

  /// PUT request
  Future<Response<T>> put<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _dio.put<T>(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }

  /// PATCH request
  Future<Response<T>> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _dio.patch<T>(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }

  /// DELETE request
  Future<Response<T>> delete<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? queryParameters,
    Options? options,
    CancelToken? cancelToken,
  }) async {
    return _dio.delete<T>(
      path,
      data: data,
      queryParameters: queryParameters,
      options: options,
      cancelToken: cancelToken,
    );
  }
}

/// Interceptor for request/response logging (debug only)
class _LoggingInterceptor extends Interceptor {
  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    if (kDebugMode) {
      debugPrint('┌──────────────────────────────────────────────────────────');
      debugPrint('│ 🚀 REQUEST: ${options.method} ${options.uri}');
      if (options.data != null) {
        debugPrint('│ 📦 Body: ${_truncate(options.data.toString(), 200)}');
      }
      debugPrint('└──────────────────────────────────────────────────────────');
    }
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (kDebugMode) {
      debugPrint('┌──────────────────────────────────────────────────────────');
      debugPrint(
          '│ ✅ RESPONSE: ${response.statusCode} ${response.requestOptions.uri}');
      debugPrint('│ 📦 Data: ${_truncate(response.data.toString(), 300)}');
      debugPrint('└──────────────────────────────────────────────────────────');
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    if (kDebugMode) {
      debugPrint('┌──────────────────────────────────────────────────────────');
      debugPrint('│ ❌ ERROR: ${err.type} ${err.requestOptions.uri}');
      debugPrint('│ 📦 Message: ${err.message}');
      if (err.response != null) {
        debugPrint(
            '│ 📦 Response: ${_truncate(err.response?.data.toString() ?? '', 200)}');
      }
      debugPrint('└──────────────────────────────────────────────────────────');
    }
    handler.next(err);
  }

  String _truncate(String text, int maxLength) {
    if (text.length <= maxLength) return text;
    return '${text.substring(0, maxLength)}...';
  }
}

/// Interceptor for global error handling
class _ErrorInterceptor extends Interceptor {
  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    // Handle 401 Unauthorized - session expired
    if (err.response?.statusCode == 401) {
      // Clear session
      ApiClient().clearSession();

      handler.reject(DioException(
        requestOptions: err.requestOptions,
        error: AuthException(
          'Session expired. Please login again.',
          statusCode: 401,
        ),
        type: err.type,
        response: err.response,
      ));
      return;
    }

    // Handle 403 Forbidden
    if (err.response?.statusCode == 403) {
      handler.reject(DioException(
        requestOptions: err.requestOptions,
        error: AuthException(
          'You do not have permission to perform this action.',
          statusCode: 403,
        ),
        type: err.type,
        response: err.response,
      ));
      return;
    }

    // Handle server errors (5xx)
    if (err.response?.statusCode != null && err.response!.statusCode! >= 500) {
      handler.reject(DioException(
        requestOptions: err.requestOptions,
        error: ApiException(
          'Server error. Please try again later.',
          statusCode: err.response?.statusCode,
        ),
        type: err.type,
        response: err.response,
      ));
      return;
    }

    // Handle network errors
    if (err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.sendTimeout ||
        err.type == DioExceptionType.receiveTimeout) {
      handler.reject(DioException(
        requestOptions: err.requestOptions,
        error: ApiException(
          'Connection timeout. Please check your internet.',
          statusCode: null,
        ),
        type: err.type,
        response: err.response,
      ));
      return;
    }

    if (err.type == DioExceptionType.connectionError) {
      handler.reject(DioException(
        requestOptions: err.requestOptions,
        error: ApiException(
          'No internet connection.',
          statusCode: null,
        ),
        type: err.type,
        response: err.response,
      ));
      return;
    }

    // Pass through other errors
    handler.next(err);
  }
}
