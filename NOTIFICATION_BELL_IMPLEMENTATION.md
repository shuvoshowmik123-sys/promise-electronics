# Notification Bell Implementation Plan

## Current State

The notification bell icon exists in `lib/screens/bento_home_screen.dart` (around line 368-413) but is **non-functional**. It's a static UI element with a red dot indicator that doesn't respond to user interaction.

### Existing Backend Infrastructure

The backend already has a solid foundation for notifications:

| Component | File | Status |
|-----------|------|--------|
| **Schema** | `shared/schema.ts` (line 735-752) | ✅ Ready |
| **Push Registration** | `server/routes/notifications.routes.ts` | ✅ Ready |
| **Storage Interface** | `server/storage.ts` | ✅ Has `getNotifications()`, `createNotification()`, `markNotificationAsRead()` |
| **Device Tokens Table** | `shared/schema.ts` (line 755-771) | ✅ Ready |

---

## Proposed Notification Types

| Type | Trigger | Example Message |
|------|---------|-----------------|
| `repair` | Repair status change | "Your repair #SRV-2026-0001 is now Ready for Delivery!" |
| `shop` | Order status change | "Your order #ORD-2026-0001 has been shipped!" |
| `promo` | Admin broadcast | "🎉 Eid Special: 20% off all repairs!" |
| `reminder` | Scheduled pickup | "Reminder: We're coming to pick up your TV tomorrow at 10 AM" |
| `info` | General system info | "We've updated our warranty policy" |

---

## Implementation Plan

### Phase 1: Backend API Endpoints (Server-Side)

Add these endpoints to `server/routes/notifications.routes.ts`:

```typescript
// GET /api/customer/notifications - Get user's notifications
router.get('/api/customer/notifications', requireCustomerAuth, async (req, res) => {
    const notifications = await storage.getNotifications(req.session.customerId!);
    res.json(notifications);
});

// PATCH /api/customer/notifications/:id/read - Mark as read
router.patch('/api/customer/notifications/:id/read', requireCustomerAuth, async (req, res) => {
    const updated = await storage.markNotificationAsRead(req.params.id);
    res.json(updated);
});

// POST /api/customer/notifications/mark-all-read - Mark all as read
router.post('/api/customer/notifications/mark-all-read', requireCustomerAuth, async (req, res) => {
    await storage.markAllNotificationsAsRead(req.session.customerId!);
    res.json({ success: true });
});

// GET /api/customer/notifications/unread-count - Get unread count
router.get('/api/customer/notifications/unread-count', requireCustomerAuth, async (req, res) => {
    const count = await storage.getUnreadNotificationCount(req.session.customerId!);
    res.json({ count });
});
```

---

### Phase 2: Flutter Provider (State Management)

Create `lib/providers/notification_provider.dart`:

```dart
import 'package:flutter/foundation.dart';
import '../repositories/notification_repository.dart';

class NotificationProvider with ChangeNotifier {
  List<AppNotification> _notifications = [];
  int _unreadCount = 0;
  bool _isLoading = false;

  List<AppNotification> get notifications => _notifications;
  int get unreadCount => _unreadCount;
  bool get hasUnread => _unreadCount > 0;
  bool get isLoading => _isLoading;

  Future<void> fetchNotifications() async {
    _isLoading = true;
    notifyListeners();
    
    _notifications = await NotificationRepository.getNotifications();
    _unreadCount = _notifications.where((n) => !n.read).length;
    
    _isLoading = false;
    notifyListeners();
  }

  Future<void> markAsRead(String id) async {
    await NotificationRepository.markAsRead(id);
    final index = _notifications.indexWhere((n) => n.id == id);
    if (index != -1 && !_notifications[index].read) {
      _notifications[index] = _notifications[index].copyWith(read: true);
      _unreadCount--;
      notifyListeners();
    }
  }

  Future<void> markAllAsRead() async {
    await NotificationRepository.markAllAsRead();
    _notifications = _notifications.map((n) => n.copyWith(read: true)).toList();
    _unreadCount = 0;
    notifyListeners();
  }
}
```

---

### Phase 3: Flutter Repository (API Layer)

Create `lib/repositories/notification_repository.dart`:

```dart
import '../config/api_config.dart';
import '../models/notification.dart';

class NotificationRepository {
  static Future<List<AppNotification>> getNotifications() async {
    final response = await ApiConfig.dio.get('/api/customer/notifications');
    return (response.data as List)
        .map((json) => AppNotification.fromJson(json))
        .toList();
  }

  static Future<void> markAsRead(String id) async {
    await ApiConfig.dio.patch('/api/customer/notifications/$id/read');
  }

  static Future<void> markAllAsRead() async {
    await ApiConfig.dio.post('/api/customer/notifications/mark-all-read');
  }
}
```

---

### Phase 4: Flutter Model

Create `lib/models/notification.dart`:

```dart
class AppNotification {
  final String id;
  final String title;
  final String message;
  final String type; // repair, shop, promo, reminder, info
  final String? link;
  final bool read;
  final DateTime createdAt;

  AppNotification({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    this.link,
    required this.read,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) {
    return AppNotification(
      id: json['id'],
      title: json['title'],
      message: json['message'],
      type: json['type'] ?? 'info',
      link: json['link'],
      read: json['read'] ?? false,
      createdAt: DateTime.parse(json['createdAt']),
    );
  }

  AppNotification copyWith({bool? read}) {
    return AppNotification(
      id: id,
      title: title,
      message: message,
      type: type,
      link: link,
      read: read ?? this.read,
      createdAt: createdAt,
    );
  }
}
```

---

### Phase 5: Flutter Notification Screen

Create `lib/screens/notifications_screen.dart`:

```dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/notification_provider.dart';
import '../providers/locale_provider.dart';

class NotificationsScreen extends StatefulWidget {
  @override
  _NotificationsScreenState createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  @override
  void initState() {
    super.initState();
    context.read<NotificationProvider>().fetchNotifications();
  }

  @override
  Widget build(BuildContext context) {
    final isBangla = context.watch<LocaleProvider>().isBangla;
    
    return Scaffold(
      appBar: AppBar(
        title: Text(isBangla ? 'নোটিফিকেশন' : 'Notifications'),
        actions: [
          TextButton(
            onPressed: () => context.read<NotificationProvider>().markAllAsRead(),
            child: Text(isBangla ? 'সব পড়া হয়েছে' : 'Mark all read'),
          ),
        ],
      ),
      body: Consumer<NotificationProvider>(
        builder: (context, provider, _) {
          if (provider.isLoading) {
            return Center(child: CircularProgressIndicator());
          }
          
          if (provider.notifications.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.notifications_off, size: 64, color: Colors.grey),
                  SizedBox(height: 16),
                  Text(isBangla ? 'কোনো নোটিফিকেশন নেই' : 'No notifications'),
                ],
              ),
            );
          }
          
          return ListView.builder(
            itemCount: provider.notifications.length,
            itemBuilder: (context, index) {
              final notification = provider.notifications[index];
              return _buildNotificationTile(notification, provider);
            },
          );
        },
      ),
    );
  }

  Widget _buildNotificationTile(AppNotification notification, NotificationProvider provider) {
    return ListTile(
      leading: _getIcon(notification.type),
      title: Text(notification.title, 
        style: TextStyle(fontWeight: notification.read ? FontWeight.normal : FontWeight.bold)),
      subtitle: Text(notification.message, maxLines: 2, overflow: TextOverflow.ellipsis),
      trailing: Text(_formatTime(notification.createdAt), style: TextStyle(fontSize: 12)),
      tileColor: notification.read ? null : Colors.green.withOpacity(0.05),
      onTap: () {
        provider.markAsRead(notification.id);
        if (notification.link != null) {
          Navigator.pushNamed(context, notification.link!);
        }
      },
    );
  }

  Widget _getIcon(String type) {
    switch (type) {
      case 'repair': return Icon(Icons.build, color: Colors.blue);
      case 'shop': return Icon(Icons.shopping_bag, color: Colors.purple);
      case 'promo': return Icon(Icons.local_offer, color: Colors.orange);
      case 'reminder': return Icon(Icons.alarm, color: Colors.teal);
      default: return Icon(Icons.info, color: Colors.grey);
    }
  }

  String _formatTime(DateTime time) {
    final diff = DateTime.now().difference(time);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }
}
```

---

### Phase 6: Update Home Screen Bell Icon

Modify `lib/screens/bento_home_screen.dart` (around line 368):

```dart
// Notification Bell - UPDATED
GestureDetector(
  onTap: () {
    HapticFeedback.lightImpact();
    Navigator.pushNamed(context, '/notifications');
  },
  child: Container(
    width: 40,
    height: 40,
    decoration: BoxDecoration(
      color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      shape: BoxShape.circle,
      boxShadow: [
        BoxShadow(
          color: Colors.black.withOpacity(0.05),
          blurRadius: 8,
        ),
      ],
    ),
    child: Consumer<NotificationProvider>(
      builder: (context, provider, _) {
        return Stack(
          children: [
            Center(
              child: Icon(
                Icons.notifications_outlined,
                color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
                size: 22,
              ),
            ),
            if (provider.hasUnread)
              Positioned(
                right: 10,
                top: 10,
                child: Container(
                  width: 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: AppColors.coralRed,
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
                      width: 2,
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    ),
  ),
),
```

---

### Phase 7: Trigger Notifications (Backend Events)

Add notification creation when events happen:

**On Repair Status Change** (`server/routes/service-requests.routes.ts`):
```typescript
// After updating stage/status
await storage.createNotification({
  userId: serviceRequest.customerId,
  title: 'Repair Update',
  message: `Your repair #${serviceRequest.ticketNumber} is now ${newStatus}`,
  type: 'repair',
  link: '/history', // Deep link to repair history
});
```

**On Order Status Change** (`server/routes/orders.routes.ts`):
```typescript
await storage.createNotification({
  userId: order.customerId,
  title: 'Order Update',
  message: `Your order #${order.orderNumber} has been ${newStatus}`,
  type: 'shop',
  link: '/order-history',
});
```

---

## Future Enhancements

### Firebase Push Notifications
1. Integrate `firebase_messaging` in Flutter
2. Register device tokens via `/api/push/register`
3. Use FCM from backend to send real-time push notifications

### Real-time Updates with SSE/WebSocket
1. Listen for new notifications in app
2. Show in-app banner when new notification arrives

### Notification Settings
1. Allow users to toggle notification preferences (Repair, Shop, Promos)
2. Store in `users.preferences` JSON field

---

## Summary

| Step | Component | Effort |
|------|-----------|--------|
| 1 | Backend endpoints | 2 hours |
| 2 | Flutter Provider | 1 hour |
| 3 | Flutter Repository | 30 min |
| 4 | Flutter Model | 30 min |
| 5 | Notifications Screen | 2 hours |
| 6 | Update Bell Icon | 30 min |
| 7 | Trigger Events | 1 hour |
| **Total** | | **~7-8 hours** |

This implementation will give users a functional notification center with read/unread status, categorized notifications, and deep linking to relevant screens.
