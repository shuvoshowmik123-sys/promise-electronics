import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:path_provider/path_provider.dart';
import 'package:flutter/foundation.dart';

/// Cookie manager wrapper interface
abstract class CookieManagerWrapper {
  Interceptor get interceptor;
  Future<bool> hasSession(String baseUrl);
  Future<void> clearAll();
}

/// Real implementation for native platforms (iOS, Android)
class _CookieManagerIO implements CookieManagerWrapper {
  final CookieJar _cookieJar;
  final CookieManager _manager;

  _CookieManagerIO(this._cookieJar) : _manager = CookieManager(_cookieJar);

  @override
  Interceptor get interceptor => _manager;

  @override
  Future<bool> hasSession(String baseUrl) async {
    try {
      final uri = Uri.parse(baseUrl);
      final cookies = await _cookieJar.loadForRequest(uri);
      if (cookies.isNotEmpty) {
        debugPrint(
            'CookieManager: Found ${cookies.length} cookies for $baseUrl');
        for (var c in cookies) {
          debugPrint(
              'Cookie: ${c.name}=${c.value} (Domain: ${c.domain}, Path: ${c.path})');
        }
      } else {
        debugPrint('CookieManager: No cookies found for $baseUrl');
      }
      return cookies.isNotEmpty;
    } catch (e) {
      debugPrint('CookieManager: Error checking session: $e');
      return false;
    }
  }

  @override
  Future<void> clearAll() async {
    await _cookieJar.deleteAll();
  }
}

/// Create cookie manager for native platforms
Future<CookieManagerWrapper?> createCookieManager() async {
  try {
    final appDocDir = await getApplicationDocumentsDirectory();
    final cookiePath = '${appDocDir.path}/.cookies/';

    final persistentCookieJar = PersistCookieJar(
      ignoreExpires: true,
      storage: FileStorage(cookiePath),
    );

    return _CookieManagerIO(persistentCookieJar);
  } catch (e) {
    // Fallback to in-memory cookies
    return _CookieManagerIO(CookieJar());
  }
}
