import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:tv_daktar/services/api_client.dart';

class PushNotificationService {
  final FirebaseMessaging _firebaseMessaging = FirebaseMessaging.instance;
  final ApiClient _apiClient = ApiClient();

  static final PushNotificationService _instance = PushNotificationService._internal();

  factory PushNotificationService() {
    return _instance;
  }

  PushNotificationService._internal();

  Future<void> initialize() async {
    // 1. Request Permission
    NotificationSettings settings = await _firebaseMessaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
    );

    if (settings.authorizationStatus == AuthorizationStatus.authorized) {
      debugPrint('User granted permission');
      
      // 2. Get Token
      String? token = await _firebaseMessaging.getToken();
      if (token != null) {
        debugPrint('FCM Token: $token');
        await _registerTokenWithBackend(token);
      }

      // 3. Listen for token refresh
      _firebaseMessaging.onTokenRefresh.listen(_registerTokenWithBackend);

      // 4. Handle foreground messages
      FirebaseMessaging.onMessage.listen((RemoteMessage message) {
        debugPrint('Got a message whilst in the foreground!');
        debugPrint('Message data: ${message.data}');

        if (message.notification != null) {
          debugPrint('Message also contained a notification: ${message.notification}');
          // You could show a local notification here using flutter_local_notifications
          // For now, we rely on the system tray (which only works in background unless configured otherwise)
        }
      });

      // 5. Handle background/terminated state taps
      FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);
      
      // Check if app was opened from a terminated state
      RemoteMessage? initialMessage = await _firebaseMessaging.getInitialMessage();
      if (initialMessage != null) {
        _handleNotificationTap(initialMessage);
      }
    } else {
      debugPrint('User declined or has not accepted permission');
    }
  }

  Future<void> _registerTokenWithBackend(String token) async {
    try {
      // Platform check
      String platform = 'web';
      if (!kIsWeb) {
        if (Platform.isAndroid) platform = 'android';
        if (Platform.isIOS) platform = 'ios';
      }

      await _apiClient.post('/api/push/register', data: {
        'token': token,
        'platform': platform,
      });
      debugPrint('Token registered with backend');
    } catch (e) {
      debugPrint('Failed to register token: $e');
    }
  }

  void _handleNotificationTap(RemoteMessage message) {
    debugPrint('Notification tapped: ${message.data}');
    // TODO: Implement navigation logic based on message.data['type'] and message.data['route']
    // e.g. Navigator.of(context).pushNamed(message.data['route']);
  }
  
  Future<void> unregisterWrapper() async {
     // Optional: Implement unregister logic if API supports it
  }
}
