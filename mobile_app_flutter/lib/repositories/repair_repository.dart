import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../services/api_client.dart';

/// Result wrapper for repository operations
class Result<T> {
  final T? data;
  final String? error;
  final bool isSuccess;

  Result.success(this.data)
      : error = null,
        isSuccess = true;

  Result.failure(this.error)
      : data = null,
        isSuccess = false;
}

/// Repair/Service Request status
enum RepairStatus {
  pending,
  received,
  diagnosing,
  waitingParts,
  repairing,
  testing,
  completed,
  delivered,
  cancelled;

  static RepairStatus fromString(String? status) {
    switch (status?.toLowerCase()) {
      case 'pending':
        return RepairStatus.pending;
      case 'received':
        return RepairStatus.received;
      case 'diagnosing':
        return RepairStatus.diagnosing;
      case 'waiting for parts':
      case 'waiting_parts':
      case 'waitingparts':
        return RepairStatus.waitingParts;
      case 'repairing':
      case 'in repair':
        return RepairStatus.repairing;
      case 'testing':
        return RepairStatus.testing;
      case 'completed':
        return RepairStatus.completed;
      case 'delivered':
        return RepairStatus.delivered;
      case 'cancelled':
        return RepairStatus.cancelled;
      default:
        return RepairStatus.pending;
    }
  }

  String get displayName {
    switch (this) {
      case RepairStatus.pending:
        return 'Pending';
      case RepairStatus.received:
        return 'Received';
      case RepairStatus.diagnosing:
        return 'Diagnosing';
      case RepairStatus.waitingParts:
        return 'Waiting for Parts';
      case RepairStatus.repairing:
        return 'In Repair';
      case RepairStatus.testing:
        return 'Testing';
      case RepairStatus.completed:
        return 'Completed';
      case RepairStatus.delivered:
        return 'Delivered';
      case RepairStatus.cancelled:
        return 'Cancelled';
    }
  }

  String get bengaliName {
    switch (this) {
      case RepairStatus.pending:
        return 'অপেক্ষমান';
      case RepairStatus.received:
        return 'গ্রহণ করা হয়েছে';
      case RepairStatus.diagnosing:
        return 'পরীক্ষা করা হচ্ছে';
      case RepairStatus.waitingParts:
        return 'পার্টসের জন্য অপেক্ষা';
      case RepairStatus.repairing:
        return 'মেরামত চলছে';
      case RepairStatus.testing:
        return 'টেস্ট করা হচ্ছে';
      case RepairStatus.completed:
        return 'সম্পন্ন';
      case RepairStatus.delivered:
        return 'ডেলিভারি সম্পন্ন';
      case RepairStatus.cancelled:
        return 'বাতিল';
    }
  }

  double get progress {
    switch (this) {
      case RepairStatus.pending:
        return 0.1;
      case RepairStatus.received:
        return 0.2;
      case RepairStatus.diagnosing:
        return 0.35;
      case RepairStatus.waitingParts:
        return 0.45;
      case RepairStatus.repairing:
        return 0.65;
      case RepairStatus.testing:
        return 0.85;
      case RepairStatus.completed:
        return 0.95;
      case RepairStatus.delivered:
        return 1.0;
      case RepairStatus.cancelled:
        return 0.0;
    }
  }
}

/// Service Request / Repair model
class ServiceRequest {
  final String id;
  final String? ticketNumber;
  final String customerName;
  final String? phone;
  final String? email;
  final String? address;
  final String device;
  final String? brand;
  final String? model;
  final String issue;
  final String? description;
  final RepairStatus status;
  final double? estimatedCost;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final List<String> images;
  final List<TimelineEvent> timeline;

  ServiceRequest({
    required this.id,
    this.ticketNumber,
    required this.customerName,
    this.phone,
    this.email,
    this.address,
    required this.device,
    this.brand,
    this.model,
    required this.issue,
    this.description,
    required this.status,
    this.estimatedCost,
    this.createdAt,
    this.updatedAt,
    this.images = const [],
    this.timeline = const [],
  });

  factory ServiceRequest.fromJson(Map<String, dynamic> json) {
    List<String> parseImages(dynamic imagesData) {
      if (imagesData == null) return [];
      if (imagesData is List) {
        return imagesData.map((e) => e.toString()).toList();
      }
      return [];
    }

    List<TimelineEvent> parseTimeline(dynamic timelineData) {
      if (timelineData == null) return [];
      if (timelineData is List) {
        return timelineData.map((e) => TimelineEvent.fromJson(e)).toList();
      }
      return [];
    }

    return ServiceRequest(
      id: json['id']?.toString() ?? '',
      ticketNumber: json['ticketNumber']?.toString(),
      customerName: json['name']?.toString() ??
          json['customerName']?.toString() ??
          'Customer',
      phone: json['phone']?.toString(),
      email: json['email']?.toString(),
      address: json['address']?.toString(),
      device: json['device']?.toString() ?? json['tvBrand']?.toString() ?? 'TV',
      brand: json['tvBrand']?.toString() ?? json['brand']?.toString(),
      model: json['tvModel']?.toString() ?? json['model']?.toString(),
      issue: json['issue']?.toString() ??
          json['problemType']?.toString() ??
          'Unknown Issue',
      description: json['problemDescription']?.toString() ??
          json['description']?.toString(),
      status: RepairStatus.fromString(
          json['trackingStatus']?.toString() ?? json['status']?.toString()),
      estimatedCost: json['estimatedCost'] != null
          ? (json['estimatedCost'] is num
              ? json['estimatedCost'].toDouble()
              : double.tryParse(json['estimatedCost']?.toString() ?? '0'))
          : null,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : null,
      updatedAt: json['updatedAt'] != null
          ? DateTime.tryParse(json['updatedAt'].toString())
          : null,
      images: parseImages(json['images'] ?? json['photoUrls']),
      timeline: parseTimeline(json['timeline']),
    );
  }
}

/// Timeline event for repair progress
class TimelineEvent {
  final String id;
  final String status;
  final String? note;
  final DateTime? timestamp;

  TimelineEvent({
    required this.id,
    required this.status,
    this.note,
    this.timestamp,
  });

  factory TimelineEvent.fromJson(Map<String, dynamic> json) {
    return TimelineEvent(
      id: json['id']?.toString() ?? '',
      status: json['status']?.toString() ??
          json['eventType']?.toString() ??
          'Updated',
      note: json['note']?.toString() ?? json['notes']?.toString(),
      timestamp: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'].toString())
          : (json['timestamp'] != null
              ? DateTime.tryParse(json['timestamp'].toString())
              : null),
    );
  }
}

/// New repair request data
class NewRepairRequest {
  final String name;
  final String phone;
  final String? email;
  final String? address;
  final String device;
  final String? brand;
  final String? model;
  final String? screenSize;
  final String problemType;
  final String? problemDescription;
  final List<String>? photoUrls;

  NewRepairRequest({
    required this.name,
    required this.phone,
    this.email,
    this.address,
    required this.device,
    this.brand,
    this.model,
    this.screenSize,
    required this.problemType,
    this.problemDescription,
    this.photoUrls,
  });

  Map<String, dynamic> toJson() => {
        'name': name,
        'phone': phone,
        if (email != null && email!.isNotEmpty) 'email': email,
        if (address != null && address!.isNotEmpty) 'address': address,
        'tvBrand': brand ?? 'Other',
        'tvModel': model ?? '',
        'tvSize': screenSize ?? '',
        'problemType': problemType,
        'problemDescription': problemDescription ?? '',
        if (photoUrls != null && photoUrls!.isNotEmpty) 'photoUrls': photoUrls,
      };
}

/// Repair Repository
/// Handles repair/service request operations
class RepairRepository {
  final ApiClient _client = ApiClient();

  /// Get customer's service requests
  /// Backend: GET /api/customer/service-requests
  Future<Result<List<ServiceRequest>>> getMyRepairs() async {
    try {
      final response = await _client.get('/api/customer/service-requests');

      if (response.statusCode == 200 && response.data != null) {
        final List<dynamic> data = response.data is List ? response.data : [];
        final repairs =
            data.map((json) => ServiceRequest.fromJson(json)).toList();
        // Sort by created date, newest first
        repairs.sort((a, b) => (b.createdAt ?? DateTime(2000))
            .compareTo(a.createdAt ?? DateTime(2000)));
        return Result.success(repairs);
      }

      return Result.failure('Failed to fetch repairs.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Get my repairs error: $e');
      return Result.failure('Failed to load repairs.');
    }
  }

  /// Get single service request details
  /// Backend: GET /api/customer/service-requests/:id
  Future<Result<ServiceRequest>> getRepairDetails(String id) async {
    try {
      final response = await _client.get('/api/customer/service-requests/$id');

      if (response.statusCode == 200 && response.data != null) {
        final repair =
            ServiceRequest.fromJson(response.data as Map<String, dynamic>);
        return Result.success(repair);
      }

      return Result.failure('Repair not found.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Get repair details error: $e');
      return Result.failure('Failed to load repair details.');
    }
  }

  /// Track order by ticket number (no auth required)
  /// Backend: GET /api/customer/track/:ticketNumber
  Future<Result<ServiceRequest>> trackByTicket(String ticketNumber) async {
    try {
      final response = await _client.get('/api/customer/track/$ticketNumber');

      if (response.statusCode == 200 && response.data != null) {
        final repair =
            ServiceRequest.fromJson(response.data as Map<String, dynamic>);
        return Result.success(repair);
      }

      return Result.failure('Order not found.');
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) {
        return Result.failure(
            'Order not found. Please check the ticket number.');
      }
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Track by ticket error: $e');
      return Result.failure('Failed to track order.');
    }
  }

  /// Submit new repair request
  /// Backend: POST /api/service-requests
  Future<Result<ServiceRequest>> submitRepairRequest(
      NewRepairRequest request) async {
    try {
      final response = await _client.post(
        '/api/service-requests',
        data: request.toJson(),
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final repair =
            ServiceRequest.fromJson(response.data as Map<String, dynamic>);
        return Result.success(repair);
      }

      return Result.failure('Failed to submit repair request.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Submit repair request error: $e');
      return Result.failure('Failed to submit repair request.');
    }
  }

  /// Link service request to customer account
  /// Backend: POST /api/customer/service-requests/link
  Future<Result<ServiceRequest>> linkRepairToAccount(
      String ticketNumber) async {
    try {
      final response = await _client.post(
        '/api/customer/service-requests/link',
        data: {'ticketNumber': ticketNumber},
      );

      if (response.statusCode == 200 && response.data != null) {
        final repair =
            ServiceRequest.fromJson(response.data as Map<String, dynamic>);
        return Result.success(repair);
      }

      return Result.failure('Failed to link repair.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Link repair error: $e');
      return Result.failure('Failed to link repair to account.');
    }
  }

  /// Get active repairs (not yet delivered/cancelled)
  Future<Result<List<ServiceRequest>>> getActiveRepairs() async {
    final result = await getMyRepairs();
    if (!result.isSuccess || result.data == null) {
      return result;
    }

    final active = result.data!
        .where((r) =>
            r.status != RepairStatus.delivered &&
            r.status != RepairStatus.cancelled)
        .toList();

    return Result.success(active);
  }

  /// Get completed/delivered repairs
  Future<Result<List<ServiceRequest>>> getCompletedRepairs() async {
    final result = await getMyRepairs();
    if (!result.isSuccess || result.data == null) {
      return result;
    }

    final completed = result.data!
        .where((r) =>
            r.status == RepairStatus.delivered ||
            r.status == RepairStatus.completed)
        .toList();

    return Result.success(completed);
  }

  /// Handle Dio errors
  Result<T> _handleDioError<T>(DioException e) {
    if (e.response != null) {
      final data = e.response?.data;
      if (data is Map<String, dynamic>) {
        final message = data['message'] ?? data['error'];
        if (message != null) {
          return Result.failure(message.toString());
        }
      }
    }

    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return Result.failure('Connection timeout. Please try again.');
      case DioExceptionType.connectionError:
        return Result.failure('No internet connection.');
      default:
        return Result.failure('Something went wrong.');
    }
  }
}
