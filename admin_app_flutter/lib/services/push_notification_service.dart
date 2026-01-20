import 'dart:io';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import '../core/api/dio_client.dart';

/// Service for handling Firebase Cloud Messaging (FCM) push notifications.
/// Manages token registration, message handling, and notification display.
class PushNotificationService {
  static PushNotificationService? _instance;
  final FirebaseMessaging _messaging = FirebaseMessaging.instance;
  final DioClient _dioClient;
  
  String? _deviceToken;
  
  static PushNotificationService getInstance(DioClient dioClient) {
    _instance ??= PushNotificationService._(dioClient);
    return _instance!;
  }
  
  PushNotificationService._(this._dioClient);
  
  String? get deviceToken => _deviceToken;
  
  /// Initialize push notifications
  /// Call this after user login
  Future<void> initialize() async {
    // Request permission (required for iOS, good practice for Android 13+)
    await _requestPermission();
    
    // Get the device token
    await _getToken();
    
    // Handle token refresh
    _messaging.onTokenRefresh.listen(_onTokenRefresh);
    
    // Handle foreground messages
    FirebaseMessaging.onMessage.listen(_onForegroundMessage);
    
    // Handle background/terminated message taps
    FirebaseMessaging.onMessageOpenedApp.listen(_onMessageOpenedApp);
    
    // Check if app was opened from a notification
    final initialMessage = await _messaging.getInitialMessage();
    if (initialMessage != null) {
      _handleNotificationTap(initialMessage);
    }
    
    print('[FCM] Push notification service initialized');
  }
  
  /// Request notification permission
  Future<void> _requestPermission() async {
    final settings = await _messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
    
    print('[FCM] Permission status: ${settings.authorizationStatus}');
  }
  
  /// Get the FCM device token
  Future<String?> _getToken() async {
    try {
      _deviceToken = await _messaging.getToken();
      print('[FCM] Device token: $_deviceToken');
      
      if (_deviceToken != null) {
        await _registerTokenWithBackend(_deviceToken!);
      }
      
      return _deviceToken;
    } catch (e) {
      print('[FCM] Error getting token: $e');
      return null;
    }
  }
  
  /// Handle token refresh
  Future<void> _onTokenRefresh(String newToken) async {
    print('[FCM] Token refreshed: $newToken');
    _deviceToken = newToken;
    await _registerTokenWithBackend(newToken);
  }
  
  /// Register token with backend for targeted push
  Future<void> _registerTokenWithBackend(String token) async {
    try {
      final platform = Platform.isAndroid ? 'android' : 
                       Platform.isIOS ? 'ios' : 'web';
      
      await _dioClient.post('/api/admin/push/register', data: {
        'token': token,
        'platform': platform,
      });
      
      print('[FCM] Token registered with backend');
    } catch (e) {
      print('[FCM] Failed to register token: $e');
    }
  }
  
  /// Handle foreground message
  void _onForegroundMessage(RemoteMessage message) {
    print('[FCM] Foreground message: ${message.notification?.title}');
    
    // The notification provider will handle showing in-app notifications
    // For foreground, FCM doesn't auto-show the notification on Android
    // We can trigger a local notification or update the provider
    
    if (message.notification != null) {
      // Notify the app about the new message
      _notifyApp(message);
    }
  }
  
  /// Handle when user taps a notification (app was in background)
  void _onMessageOpenedApp(RemoteMessage message) {
    print('[FCM] Message opened app: ${message.notification?.title}');
    _handleNotificationTap(message);
  }
  
  /// Handle notification tap - navigate to relevant screen
  void _handleNotificationTap(RemoteMessage message) {
    final data = message.data;
    final type = data['type'];
    final id = data['id'];
    
    // TODO: Use navigator or router to navigate based on type
    print('[FCM] Navigate to: $type / $id');
  }
  
  /// Notify app about new message (for in-app display)
  void _notifyApp(RemoteMessage message) {
    // This can be enhanced to communicate with AdminNotificationProvider
    print('[FCM] App notified of new message');
  }
  
  /// Unregister token (call on logout)
  Future<void> unregister() async {
    if (_deviceToken != null) {
      try {
        await _dioClient.post('/api/admin/push/unregister', data: {
          'token': _deviceToken,
        });
        print('[FCM] Token unregistered');
      } catch (e) {
        print('[FCM] Failed to unregister: $e');
      }
    }
    _deviceToken = null;
  }
}
