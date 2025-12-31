import 'package:dio/dio.dart';

/// Cookie manager wrapper interface
abstract class CookieManagerWrapper {
  Interceptor get interceptor;
  Future<bool> hasSession(String baseUrl);
  Future<void> clearAll();
}

/// Stub implementation for web platform
/// Web handles cookies automatically via browser
Future<CookieManagerWrapper?> createCookieManager() async {
  // On web, cookies are handled by the browser automatically
  // Just return null to indicate no custom cookie management needed
  return null;
}
