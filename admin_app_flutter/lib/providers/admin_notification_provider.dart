import 'dart:async';
import 'package:flutter/material.dart';
import '../services/sse_service.dart';
import '../core/api/dio_client.dart';
import '../data/models/admin_notification.dart';

/// Provider for managing admin notifications
/// Connects to SSE stream for real-time updates and provides REST API access.
class AdminNotificationProvider extends ChangeNotifier {
  final DioClient _dioClient;
  
  List<AdminNotification> _notifications = [];
  int _unreadCount = 0;
  bool _isLoading = false;
  bool _isConnected = false;
  StreamSubscription? _sseSubscription;
  
  AdminNotificationProvider(this._dioClient);
  
  // Getters
  List<AdminNotification> get notifications => _notifications;
  int get unreadCount => _unreadCount;
  bool get hasUnread => _unreadCount > 0;
  bool get isLoading => _isLoading;
  bool get isConnected => _isConnected;
  
  /// Initialize the notification system
  /// Fetches existing notifications and connects to SSE
  Future<void> initialize(String sessionCookie) async {
    await fetchNotifications();
    await _connectSSE(sessionCookie);
  }
  
  /// Connect to SSE stream for real-time updates
  Future<void> _connectSSE(String sessionCookie) async {
    try {
      final baseUrl = _dioClient.options.baseUrl;
      
      SSEService.instance.connect(
        baseUrl: baseUrl,
        sessionCookie: sessionCookie,
      );
      
      _sseSubscription = SSEService.instance.stream.listen((data) {
        _handleRealtimeNotification(data);
      });
      
      _isConnected = true;
      notifyListeners();
    } catch (e) {
      print('[NotificationProvider] SSE connect error: $e');
    }
  }
  
  /// Handle incoming real-time notification
  void _handleRealtimeNotification(Map<String, dynamic> data) {
    // Skip connection confirmation messages
    if (data['type'] == 'connected') {
      print('[NotificationProvider] SSE confirmed: ${data['message']}');
      return;
    }
    
    // Create notification from SSE data
    final notification = AdminNotification.fromSSE(data);
    
    // Add to list (most recent first)
    _notifications.insert(0, notification);
    _unreadCount++;
    
    notifyListeners();
  }
  
  /// Fetch stored notifications from API
  Future<void> fetchNotifications() async {
    _isLoading = true;
    notifyListeners();
    
    try {
      final response = await _dioClient.get('/api/admin/notifications');
      if (response.statusCode == 200) {
        final List<dynamic> data = response.data;
        _notifications = data
            .map((json) => AdminNotification.fromJson(json))
            .toList();
        _unreadCount = _notifications.where((n) => !n.read).length;
      }
    } catch (e) {
      print('[NotificationProvider] Fetch error: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
  
  /// Fetch unread count only (lighter API call)
  Future<void> fetchUnreadCount() async {
    try {
      final response = await _dioClient.get('/api/admin/notifications/unread-count');
      if (response.statusCode == 200) {
        _unreadCount = response.data['count'] ?? 0;
        notifyListeners();
      }
    } catch (e) {
      print('[NotificationProvider] Unread count error: $e');
    }
  }
  
  /// Mark a notification as read
  void markAsRead(String id) {
    final index = _notifications.indexWhere((n) => n.id == id);
    if (index != -1 && !_notifications[index].read) {
      _notifications[index] = _notifications[index].copyWith(read: true);
      _unreadCount = (_unreadCount - 1).clamp(0, _unreadCount);
      notifyListeners();
    }
  }
  
  /// Mark all notifications as read
  void markAllAsRead() {
    _notifications = _notifications
        .map((n) => n.copyWith(read: true))
        .toList();
    _unreadCount = 0;
    notifyListeners();
  }
  
  /// Clear all notifications
  void clearAll() {
    _notifications.clear();
    _unreadCount = 0;
    notifyListeners();
  }
  
  @override
  void dispose() {
    _sseSubscription?.cancel();
    SSEService.instance.disconnect();
    super.dispose();
  }
}
