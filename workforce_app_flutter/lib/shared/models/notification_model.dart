class NotificationModel {
  final String id;
  final String title;
  final String message;
  final String type;
  final String category;
  final String priority;
  final bool isRead;
  final DateTime createdAt;
  final String? deepLinkTarget;

  NotificationModel({
    required this.id,
    required this.title,
    required this.message,
    required this.type,
    required this.category,
    required this.priority,
    required this.isRead,
    required this.createdAt,
    this.deepLinkTarget,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    return NotificationModel(
      id: json['id']?.toString() ?? '',
      title: json['title']?.toString() ?? 'Notification',
      message: json['message']?.toString() ?? '',
      type: json['type']?.toString() ?? 'info',
      category: json['category']?.toString() ?? 'general',
      priority: json['priority']?.toString() ?? 'normal',
      isRead: json['isRead'] ?? false,
      createdAt: json['createdAt'] != null ? DateTime.parse(json['createdAt'].toString()) : DateTime.now(),
      deepLinkTarget: json['deepLinkTarget']?.toString(),
    );
  }
}
