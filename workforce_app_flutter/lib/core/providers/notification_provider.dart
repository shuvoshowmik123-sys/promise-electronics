import 'package:flutter/material.dart';
import '../../shared/models/notification_model.dart';
import '../api/api_client.dart';

enum NotificationProviderStatus { initial, loading, loaded, error }

class NotificationProvider extends ChangeNotifier {
  final ApiClient _apiClient;

  List<NotificationModel> _notifications = [];
  NotificationProviderStatus _status = NotificationProviderStatus.initial;
  String? _errorMessage;

  NotificationProvider(this._apiClient);

  List<NotificationModel> get notifications => _notifications;
  NotificationProviderStatus get status => _status;
  String? get errorMessage => _errorMessage;

  int get unreadCount => _notifications.where((n) => !n.isRead).length;

  Future<void> fetchNotifications() async {
    _status = NotificationProviderStatus.loading;
    _errorMessage = null;
    notifyListeners();

    try {
      final response = await _apiClient.client.get(ApiEndpoints.notifications);
      final List data = response.data['data'] ?? response.data ?? [];
      
      _notifications = data.map((json) => NotificationModel.fromJson(json)).toList();
      _status = NotificationProviderStatus.loaded;
    } catch (e) {
      _status = NotificationProviderStatus.error;
      _errorMessage = e.toString();
    }
    notifyListeners();
  }

  Future<bool> markAsRead(String id) async {
    try {
      await _apiClient.client.put(ApiEndpoints.notificationRead(id));
      
      // Optimistic update
      final index = _notifications.indexWhere((n) => n.id == id);
      if (index != -1) {
        final old = _notifications[index];
        _notifications[index] = NotificationModel(
          id: old.id,
          title: old.title,
          message: old.message,
          type: old.type,
          category: old.category,
          priority: old.priority,
          isRead: true, // Marked read
          createdAt: old.createdAt,
          deepLinkTarget: old.deepLinkTarget,
        );
        notifyListeners();
      }
      return true;
    } catch (e) {
      _errorMessage = e.toString();
      notifyListeners();
      return false;
    }
  }
}
