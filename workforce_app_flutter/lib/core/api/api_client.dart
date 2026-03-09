import 'package:flutter/foundation.dart'
    show kIsWeb, kReleaseMode, defaultTargetPlatform, TargetPlatform;
import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:path_provider/path_provider.dart';

class ApiEndpoints {
  static const String _productionBaseUrl = 'https://promiseelectronics.com';
  static const String _androidEmulatorBaseUrl = 'http://10.0.2.2:5083';
  static const String _localhostBaseUrl = 'http://localhost:5083';

  static String get baseUrl {
    const overrideBaseUrl = String.fromEnvironment('API_BASE_URL');
    if (overrideBaseUrl.isNotEmpty) {
      return overrideBaseUrl;
    }

    if (kReleaseMode) {
      return _productionBaseUrl;
    }

    if (kIsWeb) {
      return _localhostBaseUrl;
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return _androidEmulatorBaseUrl;
      default:
        return _localhostBaseUrl;
    }
  }

  // Auth
  static const String login = '/api/admin/login';
  static const String logout = '/api/admin/logout';

  // Mobile Core (from mobile.routes.ts)
  static const String bootstrap = '/api/mobile/bootstrap';
  static const String deviceToken = '/api/mobile/device-token';

  // Jobs
  static const String jobs = '/api/mobile/jobs'; // GET list
  static String jobDetail(String id) => '/api/mobile/jobs/$id';
  static String jobStatus(String id) => '/api/mobile/jobs/$id/status';
  static String jobNote(String id) => '/api/mobile/jobs/$id/note';
  static String jobMedia(String id) => '/api/mobile/jobs/$id/media';

  // Attendance
  static const String attendanceStatus = '/api/mobile/attendance/status';
  static const String attendanceCheckIn = '/api/mobile/attendance/check-in';
  static const String attendanceCheckOut = '/api/mobile/attendance/check-out';

  // Notifications
  static const String notifications = '/api/mobile/notifications';
  static String notificationRead(String id) =>
      '/api/mobile/notifications/$id/read';

  // Action Queue & Service Requests
  static const String actionQueue = '/api/mobile/action-queue';
  static const String serviceRequests = '/api/mobile/service-requests';
  static const String serviceRequestQuick =
      '/api/mobile/service-requests/quick';
  static String serviceRequestAdvance(String id) =>
      '/api/mobile/service-requests/$id/advance';
  static const String lookup = '/api/mobile/lookup';
}

class ApiClient {
  late final Dio _dio;
  late final PersistCookieJar _cookieJar;

  Dio get client => _dio;

  Future<void> init() async {
    _dio = Dio(
      BaseOptions(
        baseUrl: ApiEndpoints.baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        responseType: ResponseType.json,
        headers: {'Accept': 'application/json'},
      ),
    );

    // Initialize Cookie Jar for Express Session management (Mobile only)
    if (!kIsWeb) {
      final dir = await getApplicationDocumentsDirectory();
      _cookieJar = PersistCookieJar(
        ignoreExpires: true,
        storage: FileStorage("${dir.path}/.cookies/"),
      );
      _dio.interceptors.add(CookieManager(_cookieJar));
    } else {
      final adapter = _dio.httpClientAdapter as dynamic;
      adapter.withCredentials = true;
    }
    // Add custom interceptors
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          if (kIsWeb) {
            options.extra['withCredentials'] = true;
          }
          // Logging or injecting custom headers could go here
          return handler.next(options);
        },
        onResponse: (response, handler) {
          return handler.next(response);
        },
        onError: (DioException e, handler) {
          // Handle 401 Unauthorized globally if needed (trigger logout)
          if (e.response?.statusCode == 401) {
            // You could use an event bus or direct reference to trigger routing here
          }
          return handler.next(e);
        },
      ),
    );
  }

  Future<void> clearCookies() async {
    if (!kIsWeb) {
      await _cookieJar.deleteAll();
    }
  }
}
