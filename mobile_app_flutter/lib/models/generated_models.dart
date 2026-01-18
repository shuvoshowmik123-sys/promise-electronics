//
// GENERATED CODE - DO NOT MODIFY BY HAND
//
// **************************************************************************
// Quicktype Generated Models
// **************************************************************************

// To parse this JSON data, do
//
//     final error = errorFromJson(jsonString);
//     final user = userFromJson(jsonString);
//     final jobTicket = jobTicketFromJson(jsonString);
//     final serviceRequest = serviceRequestFromJson(jsonString);
//     final order = orderFromJson(jsonString);
//     final inventoryItem = inventoryItemFromJson(jsonString);

import 'dart:convert';

Error errorFromJson(String str) => Error.fromJson(json.decode(str));

String errorToJson(Error data) => json.encode(data.toJson());

User userFromJson(String str) => User.fromJson(json.decode(str));

String userToJson(User data) => json.encode(data.toJson());

JobTicket jobTicketFromJson(String str) => JobTicket.fromJson(json.decode(str));

String jobTicketToJson(JobTicket data) => json.encode(data.toJson());

ServiceRequest serviceRequestFromJson(String str) =>
    ServiceRequest.fromJson(json.decode(str));

String serviceRequestToJson(ServiceRequest data) => json.encode(data.toJson());

Order orderFromJson(String str) => Order.fromJson(json.decode(str));

String orderToJson(Order data) => json.encode(data.toJson());

InventoryItem inventoryItemFromJson(String str) =>
    InventoryItem.fromJson(json.decode(str));

String inventoryItemToJson(InventoryItem data) => json.encode(data.toJson());

class Error {
  ///Additional error details
  final Map<String, dynamic> details;

  ///Error message
  final String error;

  Error({
    required this.details,
    required this.error,
  });

  Error copyWith({
    Map<String, dynamic>? details,
    String? error,
  }) =>
      Error(
        details: details ?? this.details,
        error: error ?? this.error,
      );

  factory Error.fromJson(Map<String, dynamic> json) => Error(
        details: Map.from(json['details'])
            .map((k, v) => MapEntry<String, dynamic>(k, v)),
        error: json['error'],
      );

  Map<String, dynamic> toJson() => {
        'details':
            Map.from(details).map((k, v) => MapEntry<String, dynamic>(k, v)),
        'error': error,
      };
}

class User {
  final DateTime createdAt;
  final String email;
  final int id;
  final Role role;
  final String username;

  User({
    required this.createdAt,
    required this.email,
    required this.id,
    required this.role,
    required this.username,
  });

  User copyWith({
    DateTime? createdAt,
    String? email,
    int? id,
    Role? role,
    String? username,
  }) =>
      User(
        createdAt: createdAt ?? this.createdAt,
        email: email ?? this.email,
        id: id ?? this.id,
        role: role ?? this.role,
        username: username ?? this.username,
      );

  factory User.fromJson(Map<String, dynamic> json) => User(
        createdAt: DateTime.parse(json['createdAt']),
        email: json['email'],
        id: json['id'],
        role: roleValues.map[json['role']]!,
        username: json['username'],
      );

  Map<String, dynamic> toJson() => {
        'createdAt': createdAt.toIso8601String(),
        'email': email,
        'id': id,
        'role': roleValues.reverse[role],
        'username': username,
      };
}

enum Role { accountant, admin, customer, superAdmin, technician }

final roleValues = EnumValues({
  'Accountant': Role.accountant,
  'Admin': Role.admin,
  'Customer': Role.customer,
  'Super Admin': Role.superAdmin,
  'Technician': Role.technician
});

class JobTicket {
  final DateTime createdAt;
  final String customer;
  final String device;
  final int id;
  final String issue;
  final String phone;
  final JobTicketStatus status;
  final String technician;

  JobTicket({
    required this.createdAt,
    required this.customer,
    required this.device,
    required this.id,
    required this.issue,
    required this.phone,
    required this.status,
    required this.technician,
  });

  JobTicket copyWith({
    DateTime? createdAt,
    String? customer,
    String? device,
    int? id,
    String? issue,
    String? phone,
    JobTicketStatus? status,
    String? technician,
  }) =>
      JobTicket(
        createdAt: createdAt ?? this.createdAt,
        customer: customer ?? this.customer,
        device: device ?? this.device,
        id: id ?? this.id,
        issue: issue ?? this.issue,
        phone: phone ?? this.phone,
        status: status ?? this.status,
        technician: technician ?? this.technician,
      );

  factory JobTicket.fromJson(Map<String, dynamic> json) => JobTicket(
        createdAt: DateTime.parse(json['createdAt']),
        customer: json['customer'],
        device: json['device'],
        id: json['id'],
        issue: json['issue'],
        phone: json['phone'],
        status: jobTicketStatusValues.map[json['status']]!,
        technician: json['technician'],
      );

  Map<String, dynamic> toJson() => {
        'createdAt': createdAt.toIso8601String(),
        'customer': customer,
        'device': device,
        'id': id,
        'issue': issue,
        'phone': phone,
        'status': jobTicketStatusValues.reverse[status],
        'technician': technician,
      };
}

enum JobTicketStatus {
  delivered,
  diagnosing,
  inProgress,
  pending,
  ready,
  waitingParts
}

final jobTicketStatusValues = EnumValues({
  'Delivered': JobTicketStatus.delivered,
  'Diagnosing': JobTicketStatus.diagnosing,
  'In Progress': JobTicketStatus.inProgress,
  'Pending': JobTicketStatus.pending,
  'Ready': JobTicketStatus.ready,
  'Waiting Parts': JobTicketStatus.waitingParts
});

class ServiceRequest {
  final String brand;
  final DateTime createdAt;
  final String customerName;
  final int id;
  final String phone;
  final String screenSize;
  final String stage;
  final String ticketNumber;
  final String trackingStatus;

  ServiceRequest({
    required this.brand,
    required this.createdAt,
    required this.customerName,
    required this.id,
    required this.phone,
    required this.screenSize,
    required this.stage,
    required this.ticketNumber,
    required this.trackingStatus,
  });

  ServiceRequest copyWith({
    String? brand,
    DateTime? createdAt,
    String? customerName,
    int? id,
    String? phone,
    String? screenSize,
    String? stage,
    String? ticketNumber,
    String? trackingStatus,
  }) =>
      ServiceRequest(
        brand: brand ?? this.brand,
        createdAt: createdAt ?? this.createdAt,
        customerName: customerName ?? this.customerName,
        id: id ?? this.id,
        phone: phone ?? this.phone,
        screenSize: screenSize ?? this.screenSize,
        stage: stage ?? this.stage,
        ticketNumber: ticketNumber ?? this.ticketNumber,
        trackingStatus: trackingStatus ?? this.trackingStatus,
      );

  factory ServiceRequest.fromJson(Map<String, dynamic> json) => ServiceRequest(
        brand: json['brand'],
        createdAt: DateTime.parse(json['createdAt']),
        customerName: json['customerName'],
        id: json['id'],
        phone: json['phone'],
        screenSize: json['screenSize'],
        stage: json['stage'],
        ticketNumber: json['ticketNumber'],
        trackingStatus: json['trackingStatus'],
      );

  Map<String, dynamic> toJson() => {
        'brand': brand,
        'createdAt': createdAt.toIso8601String(),
        'customerName': customerName,
        'id': id,
        'phone': phone,
        'screenSize': screenSize,
        'stage': stage,
        'ticketNumber': ticketNumber,
        'trackingStatus': trackingStatus,
      };
}

class Order {
  final DateTime createdAt;
  final int customerId;
  final int id;
  final String orderNumber;
  final OrderStatus status;
  final double total;

  Order({
    required this.createdAt,
    required this.customerId,
    required this.id,
    required this.orderNumber,
    required this.status,
    required this.total,
  });

  Order copyWith({
    DateTime? createdAt,
    int? customerId,
    int? id,
    String? orderNumber,
    OrderStatus? status,
    double? total,
  }) =>
      Order(
        createdAt: createdAt ?? this.createdAt,
        customerId: customerId ?? this.customerId,
        id: id ?? this.id,
        orderNumber: orderNumber ?? this.orderNumber,
        status: status ?? this.status,
        total: total ?? this.total,
      );

  factory Order.fromJson(Map<String, dynamic> json) => Order(
        createdAt: DateTime.parse(json['createdAt']),
        customerId: json['customerId'],
        id: json['id'],
        orderNumber: json['orderNumber'],
        status: orderStatusValues.map[json['status']]!,
        total: json['total']?.toDouble(),
      );

  Map<String, dynamic> toJson() => {
        'createdAt': createdAt.toIso8601String(),
        'customerId': customerId,
        'id': id,
        'orderNumber': orderNumber,
        'status': orderStatusValues.reverse[status],
        'total': total,
      };
}

enum OrderStatus { accepted, declined, delivered, pending, processing, shipped }

final orderStatusValues = EnumValues({
  'Accepted': OrderStatus.accepted,
  'Declined': OrderStatus.declined,
  'Delivered': OrderStatus.delivered,
  'Pending': OrderStatus.pending,
  'Processing': OrderStatus.processing,
  'Shipped': OrderStatus.shipped
});

class InventoryItem {
  final String category;
  final int id;
  final String name;
  final double purchasePrice;
  final double sellPrice;
  final int stock;

  InventoryItem({
    required this.category,
    required this.id,
    required this.name,
    required this.purchasePrice,
    required this.sellPrice,
    required this.stock,
  });

  InventoryItem copyWith({
    String? category,
    int? id,
    String? name,
    double? purchasePrice,
    double? sellPrice,
    int? stock,
  }) =>
      InventoryItem(
        category: category ?? this.category,
        id: id ?? this.id,
        name: name ?? this.name,
        purchasePrice: purchasePrice ?? this.purchasePrice,
        sellPrice: sellPrice ?? this.sellPrice,
        stock: stock ?? this.stock,
      );

  factory InventoryItem.fromJson(Map<String, dynamic> json) => InventoryItem(
        category: json['category'],
        id: json['id'],
        name: json['name'],
        purchasePrice: json['purchasePrice']?.toDouble(),
        sellPrice: json['sellPrice']?.toDouble(),
        stock: json['stock'],
      );

  Map<String, dynamic> toJson() => {
        'category': category,
        'id': id,
        'name': name,
        'purchasePrice': purchasePrice,
        'sellPrice': sellPrice,
        'stock': stock,
      };
}

class EnumValues<T> {
  Map<String, T> map;
  late Map<T, String> reverseMap;

  EnumValues(this.map);

  Map<T, String> get reverse {
    reverseMap = map.map((k, v) => MapEntry(v, k));
    return reverseMap;
  }
}
