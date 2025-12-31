import 'package:flutter/foundation.dart';
import '../services/api_client.dart';

/// Order model representing a shop order
class Order {
  final String id;
  final String orderNumber;
  final String customerId;
  final String customerName;
  final String customerPhone;
  final String customerAddress;
  final String status;
  final String paymentMethod;
  final double subtotal;
  final double total;
  final String? notes;
  final String? declineReason;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<OrderItem>? items;

  Order({
    required this.id,
    required this.orderNumber,
    required this.customerId,
    required this.customerName,
    required this.customerPhone,
    required this.customerAddress,
    required this.status,
    required this.paymentMethod,
    required this.subtotal,
    required this.total,
    this.notes,
    this.declineReason,
    required this.createdAt,
    required this.updatedAt,
    this.items,
  });

  factory Order.fromJson(Map<String, dynamic> json) {
    return Order(
      id: json['id'] ?? '',
      orderNumber: json['orderNumber'] ?? '',
      customerId: json['customerId'] ?? '',
      customerName: json['customerName'] ?? '',
      customerPhone: json['customerPhone'] ?? '',
      customerAddress: json['customerAddress'] ?? '',
      status: json['status'] ?? 'Pending',
      paymentMethod: json['paymentMethod'] ?? 'COD',
      subtotal: (json['subtotal'] is num
              ? json['subtotal'].toDouble()
              : double.tryParse(json['subtotal']?.toString() ?? '0')) ??
          0,
      total: (json['total'] is num
              ? json['total'].toDouble()
              : double.tryParse(json['total']?.toString() ?? '0')) ??
          0,
      notes: json['notes'],
      declineReason: json['declineReason'],
      createdAt: json['createdAt'] != null
          ? DateTime.parse(json['createdAt'])
          : DateTime.now(),
      updatedAt: json['updatedAt'] != null
          ? DateTime.parse(json['updatedAt'])
          : DateTime.now(),
      items: json['items'] != null
          ? (json['items'] as List)
              .map((item) => OrderItem.fromJson(item))
              .toList()
          : null,
    );
  }

  /// Get formatted date
  String get formattedDate {
    final months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ];
    return '${months[createdAt.month - 1]} ${createdAt.day}, ${createdAt.year}';
  }

  /// Get formatted time
  String get formattedTime {
    final hour = createdAt.hour > 12 ? createdAt.hour - 12 : createdAt.hour;
    final period = createdAt.hour >= 12 ? 'PM' : 'AM';
    return '${hour == 0 ? 12 : hour}:${createdAt.minute.toString().padLeft(2, '0')} $period';
  }

  /// Get formatted total
  String get formattedTotal => '৳${total.toStringAsFixed(0)}';

  /// Get item count
  int get itemCount => items?.length ?? 0;

  /// Check if order is active (not completed or cancelled)
  bool get isActive => !['Delivered', 'Declined', 'Cancelled'].contains(status);
}

/// Order item model
class OrderItem {
  final String id;
  final String orderId;
  final String productId;
  final String productName;
  final String? variantId;
  final String? variantName;
  final int quantity;
  final double price;
  final double total;

  OrderItem({
    required this.id,
    required this.orderId,
    required this.productId,
    required this.productName,
    this.variantId,
    this.variantName,
    required this.quantity,
    required this.price,
    required this.total,
  });

  factory OrderItem.fromJson(Map<String, dynamic> json) {
    return OrderItem(
      id: json['id'] ?? '',
      orderId: json['orderId'] ?? '',
      productId: json['productId'] ?? '',
      productName: json['productName'] ?? '',
      variantId: json['variantId'],
      variantName: json['variantName'],
      quantity: json['quantity'] ?? 1,
      price: (json['price'] is num
              ? json['price'].toDouble()
              : double.tryParse(json['price']?.toString() ?? '0')) ??
          0,
      total: (json['total'] is num
              ? json['total'].toDouble()
              : double.tryParse(json['total']?.toString() ?? '0')) ??
          0,
    );
  }

  /// Get formatted price
  String get formattedPrice => '৳${price.toStringAsFixed(0)}';

  /// Get formatted total
  String get formattedTotal => '৳${total.toStringAsFixed(0)}';

  /// Get display name with variant
  String get displayName =>
      variantName != null ? '$productName ($variantName)' : productName;
}

/// API result wrapper
class OrderApiResult<T> {
  final T? data;
  final String? error;
  final bool isSuccess;

  OrderApiResult._({this.data, this.error, required this.isSuccess});

  factory OrderApiResult.success(T data) =>
      OrderApiResult._(data: data, isSuccess: true);
  factory OrderApiResult.failure(String error) =>
      OrderApiResult._(error: error, isSuccess: false);
}

/// Repository for fetching order data
class OrderRepository {
  final ApiClient _apiClient = ApiClient();

  /// Get all orders for authenticated customer
  Future<OrderApiResult<List<Order>>> getCustomerOrders() async {
    try {
      final response = await _apiClient.get('/api/customer/orders');

      if (response.statusCode == 200) {
        final List<dynamic> data = response.data as List<dynamic>;
        final orders = data
            .map((json) => Order.fromJson(json as Map<String, dynamic>))
            .toList();
        // Sort by date descending (newest first)
        orders.sort((a, b) => b.createdAt.compareTo(a.createdAt));
        return OrderApiResult.success(orders);
      } else {
        return OrderApiResult.failure('Failed to load orders');
      }
    } catch (e) {
      debugPrint('Error fetching orders: $e');
      if (e.toString().contains('401') ||
          e.toString().contains('AuthException')) {
        return OrderApiResult.failure('Please sign in to view your orders');
      }
      return OrderApiResult.failure('Network error. Please try again.');
    }
  }

  /// Get order details with items
  Future<OrderApiResult<Order>> getOrderDetails(String orderId) async {
    try {
      final response = await _apiClient.get('/api/customer/orders/$orderId');

      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        return OrderApiResult.success(Order.fromJson(data));
      } else {
        return OrderApiResult.failure('Failed to load order details');
      }
    } catch (e) {
      debugPrint('Error fetching order details: $e');
      if (e.toString().contains('401') ||
          e.toString().contains('AuthException')) {
        return OrderApiResult.failure('Please sign in to view order details');
      }
      if (e.toString().contains('404')) {
        return OrderApiResult.failure('Order not found');
      }
      return OrderApiResult.failure('Network error. Please try again.');
    }
  }

  /// Track order by order number (public)
  Future<OrderApiResult<Order>> trackOrder(String orderNumber) async {
    try {
      final response = await _apiClient.get('/api/orders/track/$orderNumber');

      if (response.statusCode == 200) {
        final data = response.data as Map<String, dynamic>;
        return OrderApiResult.success(Order.fromJson(data));
      } else {
        return OrderApiResult.failure('Failed to track order');
      }
    } catch (e) {
      debugPrint('Error tracking order: $e');
      if (e.toString().contains('404')) {
        return OrderApiResult.failure('Order not found');
      }
      return OrderApiResult.failure('Network error. Please try again.');
    }
  }

  /// Create a spare part order
  Future<OrderApiResult<Order>> createSparePartOrder(
      Map<String, dynamic> orderData) async {
    try {
      final response = await _apiClient.post(
        '/api/orders/spare-parts',
        data: orderData,
      );

      if (response.statusCode == 201) {
        final data = response.data['order'] as Map<String, dynamic>;
        return OrderApiResult.success(Order.fromJson(data));
      } else {
        return OrderApiResult.failure('Failed to create order');
      }
    } catch (e) {
      debugPrint('Error creating spare part order: $e');
      if (e.toString().contains('401') ||
          e.toString().contains('AuthException')) {
        return OrderApiResult.failure('Please sign in to place an order');
      }
      return OrderApiResult.failure('Network error. Please try again.');
    }
  }

  /// Create a standard order
  Future<OrderApiResult<Order>> createOrder(
      Map<String, dynamic> orderData) async {
    try {
      final response = await _apiClient.post(
        '/api/orders',
        data: orderData,
      );

      if (response.statusCode == 201) {
        final data = response.data['order'] as Map<String, dynamic>;
        return OrderApiResult.success(Order.fromJson(data));
      } else {
        return OrderApiResult.failure('Failed to create order');
      }
    } catch (e) {
      debugPrint('Error creating order: $e');
      if (e.toString().contains('401') ||
          e.toString().contains('AuthException')) {
        return OrderApiResult.failure('Please sign in to place an order');
      }
      return OrderApiResult.failure('Network error. Please try again.');
    }
  }

  /// Upload image for spare part order
  Future<String?> uploadImage(String base64Image) async {
    try {
      final response = await _apiClient.post(
        '/api/imagekit/upload',
        data: {
          'file': base64Image,
          'fileName': 'spare_part_${DateTime.now().millisecondsSinceEpoch}'
        },
      );

      if (response.statusCode == 200) {
        return response.data['url'];
      }
      return null;
    } catch (e) {
      debugPrint('Error uploading image: $e');
      return null;
    }
  }
}
