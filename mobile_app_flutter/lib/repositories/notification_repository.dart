import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../services/api_client.dart';
import '../models/notification.dart';

/// Repository for notification-related API calls
class NotificationRepository {
  static final ApiClient _client = ApiClient();

  /// Get all notifications for the current user
  static Future<List<AppNotification>> getNotifications() async {
    try {
      final response = await _client.get('/api/customer/notifications');
      if (response.statusCode == 200 && response.data is List) {
        return (response.data as List)
            .map((json) => AppNotification.fromJson(json))
            .toList();
      }
      return [];
    } on DioException catch (e) {
      debugPrint('Error fetching notifications: $e');
      return [];
    } catch (e) {
      debugPrint('Error fetching notifications: $e');
      return [];
    }
  }

  /// Get unread notification count
  static Future<int> getUnreadCount() async {
    try {
      final response =
          await _client.get('/api/customer/notifications/unread-count');
      if (response.statusCode == 200 && response.data != null) {
        final count = response.data['count'];
        // Handle both int and String responses
        if (count is int) return count;
        if (count is String) return int.tryParse(count) ?? 0;
        return 0;
      }
      return 0;
    } on DioException catch (e) {
      debugPrint('Error fetching unread count: $e');
      return 0;
    } catch (e) {
      debugPrint('Error fetching unread count: $e');
      return 0;
    }
  }

  /// Mark a single notification as read
  static Future<bool> markAsRead(String id) async {
    try {
      final response =
          await _client.patch('/api/customer/notifications/$id/read');
      return response.statusCode == 200;
    } on DioException catch (e) {
      debugPrint('Error marking notification as read: $e');
      return false;
    } catch (e) {
      debugPrint('Error marking notification as read: $e');
      return false;
    }
  }

  /// Mark all notifications as read
  static Future<bool> markAllAsRead() async {
    try {
      final response =
          await _client.post('/api/customer/notifications/mark-all-read');
      return response.statusCode == 200;
    } on DioException catch (e) {
      debugPrint('Error marking all notifications as read: $e');
      return false;
    } catch (e) {
      debugPrint('Error marking all notifications as read: $e');
      return false;
    }
  }
}
