/// Admin Notification Model
/// Represents a notification received via SSE or REST API.
class AdminNotification {
  final String id;
  final String type;
  final String title;
  final String message;
  final DateTime createdAt;
  final bool read;
  final String? link;

  AdminNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    required this.createdAt,
    this.read = false,
    this.link,
  });

  /// Create from REST API JSON
  factory AdminNotification.fromJson(Map<String, dynamic> json) {
    return AdminNotification(
      id: json['id'] ?? '',
      type: json['type'] ?? 'info',
      title: json['title'] ?? 'Notification',
      message: json['message'] ?? '',
      createdAt: json['createdAt'] != null 
          ? DateTime.parse(json['createdAt']) 
          : DateTime.now(),
      read: json['read'] ?? false,
      link: json['link'],
    );
  }
  
  /// Create from SSE event data
  factory AdminNotification.fromSSE(Map<String, dynamic> data) {
    // SSE events have slightly different structure
    // type: 'service_request_created', data: {...}
    final type = data['type'] ?? 'info';
    final innerData = data['data'] as Map<String, dynamic>? ?? data;
    
    String title;
    String message;
    String? link;
    
    switch (type) {
      case 'service_request_created':
        title = '🔧 New Service Request';
        message = innerData['brand'] != null 
            ? 'New request for ${innerData['brand']} ${innerData['modelNumber'] ?? ''}'
            : 'New service request submitted';
        link = '/service-requests';
        break;
      case 'service_request_updated':
        title = 'Service Request Updated';
        message = innerData['message'] ?? 'Status changed';
        link = '/service-requests';
        break;
      case 'job_ticket_created':
        title = '📋 New Job Ticket';
        message = innerData['id'] ?? 'New job created';
        link = '/job-tickets';
        break;
      case 'order_created':
        title = '🛒 New Order';
        message = 'Order #${innerData['orderNumber'] ?? innerData['id']}';
        link = '/orders';
        break;
      case 'quote_submitted':
        title = '💰 Quote Request';
        message = 'New quote from ${innerData['customerName'] ?? 'customer'}';
        link = '/quotes';
        break;
      case 'customer_registered':
        title = '👤 New Customer';
        message = innerData['name'] ?? 'New customer registered';
        link = '/customers';
        break;
      default:
        title = 'Notification';
        message = data['message'] ?? 'New event';
    }
    
    return AdminNotification(
      id: '${type}_${DateTime.now().millisecondsSinceEpoch}',
      type: type,
      title: title,
      message: message,
      createdAt: DateTime.now(),
      read: false,
      link: link,
    );
  }

  /// Create a copy with updated properties
  AdminNotification copyWith({bool? read}) {
    return AdminNotification(
      id: id,
      type: type,
      title: title,
      message: message,
      createdAt: createdAt,
      read: read ?? this.read,
      link: link,
    );
  }
  
  /// Get icon for notification type
  String get icon {
    switch (type) {
      case 'service_request_created':
      case 'service_request_updated':
        return '🔧';
      case 'job_ticket_created':
        return '📋';
      case 'order_created':
        return '🛒';
      case 'quote_submitted':
        return '💰';
      case 'customer_registered':
        return '👤';
      default:
        return 'ℹ️';
    }
  }
}
