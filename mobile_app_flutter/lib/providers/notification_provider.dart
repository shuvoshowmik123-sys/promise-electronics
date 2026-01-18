import 'package:flutter/foundation.dart';
import '../models/notification.dart';
import '../repositories/notification_repository.dart';

/// Provider for managing notification state
class NotificationProvider with ChangeNotifier {
  List<AppNotification> _notifications = [];
  int _unreadCount = 0;
  bool _isLoading = false;
  String? _error;

  List<AppNotification> get notifications => _notifications;
  int get unreadCount => _unreadCount;
  bool get hasUnread => _unreadCount > 0;
  bool get isLoading => _isLoading;
  String? get error => _error;

  /// Fetch all notifications from the server
  Future<void> fetchNotifications() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      _notifications = await NotificationRepository.getNotifications();
      _unreadCount = _notifications.where((n) => !n.read).length;
    } catch (e) {
      _error = 'Failed to load notifications';
      debugPrint('NotificationProvider error: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Fetch only the unread count (lighter API call)
  Future<void> fetchUnreadCount() async {
    try {
      _unreadCount = await NotificationRepository.getUnreadCount();
      notifyListeners();
    } catch (e) {
      debugPrint('Error fetching unread count: $e');
    }
  }

  /// Mark a single notification as read
  Future<void> markAsRead(String id) async {
    final success = await NotificationRepository.markAsRead(id);
    if (success) {
      final index = _notifications.indexWhere((n) => n.id == id);
      if (index != -1 && !_notifications[index].read) {
        _notifications[index] = _notifications[index].copyWith(read: true);
        _unreadCount = (_unreadCount - 1).clamp(0, _notifications.length);
        notifyListeners();
      }
    }
  }

  /// Mark all notifications as read
  Future<void> markAllAsRead() async {
    final success = await NotificationRepository.markAllAsRead();
    if (success) {
      _notifications =
          _notifications.map((n) => n.copyWith(read: true)).toList();
      _unreadCount = 0;
      notifyListeners();
    }
  }

  /// Clear notifications (for logout)
  void clear() {
    _notifications = [];
    _unreadCount = 0;
    _error = null;
    notifyListeners();
  }
}
