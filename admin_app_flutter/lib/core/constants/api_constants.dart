import 'package:flutter/foundation.dart';

class ApiConstants {
  // Base URL
  // Use http://10.0.2.2:5083 for Android Emulator
  // Use http://localhost:5083 for Web
  static String get baseUrl {
    if (kIsWeb) return 'http://localhost:5083';
    return 'http://10.0.2.2:5083';
  }
  
  // Auth Endpoints
  static const String login = '/api/admin/login';
  static const String logout = '/api/admin/logout';
  static const String me = '/api/admin/me';
}
