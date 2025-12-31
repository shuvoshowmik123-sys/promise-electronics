import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

/// Result from AI Identify analysis
class IdentifyResult {
  final String label;
  final String labelBn;
  final double confidence;
  final BoundingBox? boundingBox;
  final String issueType;
  final String description;
  final String descriptionBn;
  final String rawText;

  IdentifyResult({
    required this.label,
    required this.labelBn,
    required this.confidence,
    this.boundingBox,
    required this.issueType,
    required this.description,
    required this.descriptionBn,
    required this.rawText,
  });

  factory IdentifyResult.fromJson(Map<String, dynamic> json) {
    return IdentifyResult(
      label: json['label'] ?? 'Unknown Component',
      labelBn: json['labelBn'] ?? json['label'] ?? 'অজানা উপাদান',
      confidence: (json['confidence'] ?? 0.0).toDouble(),
      boundingBox: json['boundingBox'] != null
          ? BoundingBox.fromJson(json['boundingBox'])
          : null,
      issueType: json['issueType'] ?? 'general',
      description: json['description'] ?? '',
      descriptionBn: json['descriptionBn'] ?? json['description'] ?? '',
      rawText: json['rawText'] ?? '',
    );
  }
}

/// Result from AI Assess (damage analysis)
class AssessResult {
  final List<String> damage;
  final String severity;
  final String severityBn;
  final String likelyCause;
  final String likelyCauseBn;
  final double? estimatedCostMin;
  final double? estimatedCostMax;
  final String rawText;

  AssessResult({
    required this.damage,
    required this.severity,
    required this.severityBn,
    required this.likelyCause,
    required this.likelyCauseBn,
    this.estimatedCostMin,
    this.estimatedCostMax,
    required this.rawText,
  });

  factory AssessResult.fromJson(Map<String, dynamic> json) {
    return AssessResult(
      damage: List<String>.from(json['damage'] ?? []),
      severity: json['severity'] ?? 'Unknown',
      severityBn: json['severityBn'] ?? 'অজানা',
      likelyCause: json['likelyCause'] ?? '',
      likelyCauseBn: json['likelyCauseBn'] ?? '',
      estimatedCostMin: json['estimatedCostMin']?.toDouble(),
      estimatedCostMax: json['estimatedCostMax']?.toDouble(),
      rawText: json['rawText'] ?? '',
    );
  }
}

/// Bounding box for visual annotations
class BoundingBox {
  final double x;
  final double y;
  final double width;
  final double height;

  BoundingBox({
    required this.x,
    required this.y,
    required this.width,
    required this.height,
  });

  factory BoundingBox.fromJson(Map<String, dynamic> json) {
    return BoundingBox(
      x: (json['x'] ?? 0.0).toDouble(),
      y: (json['y'] ?? 0.0).toDouble(),
      width: (json['width'] ?? 0.0).toDouble(),
      height: (json['height'] ?? 0.0).toDouble(),
    );
  }
}

/// Job tracking info from QR code scan
class JobTrackingInfo {
  final String id;
  final String? device;
  final String? screenSize;
  final String status;
  final DateTime? createdAt;
  final DateTime? completedAt;
  final double? estimatedCost;
  final DateTime? deadline;

  JobTrackingInfo({
    required this.id,
    this.device,
    this.screenSize,
    required this.status,
    this.createdAt,
    this.completedAt,
    this.estimatedCost,
    this.deadline,
  });

  factory JobTrackingInfo.fromJson(Map<String, dynamic> json) {
    return JobTrackingInfo(
      id: json['id'] ?? '',
      device: json['device'],
      screenSize: json['screenSize'],
      status: json['status'] ?? 'Unknown',
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'])
          : null,
      completedAt: json['completedAt'] != null
          ? DateTime.tryParse(json['completedAt'])
          : null,
      estimatedCost: json['estimatedCost']?.toDouble(),
      deadline:
          json['deadline'] != null ? DateTime.tryParse(json['deadline']) : null,
    );
  }

  String get deviceDisplay {
    if (device == null) return 'Unknown Device';
    if (screenSize != null) return '$device $screenSize';
    return device!;
  }
}

/// Service for Daktar er Lens AI features
class LensService {
  static final LensService _instance = LensService._internal();
  factory LensService() => _instance;
  LensService._internal();

  /// Identify a TV component or issue from image
  Future<IdentifyResult?> identifyPart(String base64Image) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConfig.lensIdentifyEndpoint),
        headers: ApiConfig.headers,
        body: jsonEncode({'image': base64Image}),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return IdentifyResult.fromJson(data);
      } else {
        debugPrint('[LensService] Identify failed: ${response.statusCode}');
        return null;
      }
    } catch (e) {
      debugPrint('[LensService] Identify error: $e');
      return null;
    }
  }

  /// Assess damage from image
  Future<AssessResult?> assessDamage(String base64Image) async {
    try {
      final response = await http.post(
        Uri.parse(ApiConfig.lensAssessEndpoint),
        headers: ApiConfig.headers,
        body: jsonEncode({'image': base64Image}),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return AssessResult.fromJson(data);
      } else {
        debugPrint('[LensService] Assess failed: ${response.statusCode}');
        return null;
      }
    } catch (e) {
      debugPrint('[LensService] Assess error: $e');
      return null;
    }
  }

  /// Get job info from scanned QR code data
  Future<JobTrackingInfo?> getJobFromQrCode(String qrData) async {
    final jobId = extractJobIdFromQr(qrData);
    if (jobId == null) {
      debugPrint('[LensService] Could not extract job ID from QR: $qrData');
      return null;
    }

    try {
      final response = await http.get(
        Uri.parse(ApiConfig.jobTrackEndpoint(jobId)),
        headers: ApiConfig.headers,
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        return JobTrackingInfo.fromJson(data);
      } else {
        debugPrint('[LensService] Job track failed: ${response.statusCode}');
        return null;
      }
    } catch (e) {
      debugPrint('[LensService] Job track error: $e');
      return null;
    }
  }

  /// Extract job ID from QR code URL
  /// Format: https://tvdaktar.com/track?id=JOB-123
  String? extractJobIdFromQr(String qrData) {
    try {
      final uri = Uri.tryParse(qrData);
      if (uri != null && uri.queryParameters.containsKey('id')) {
        return uri.queryParameters['id'];
      }

      // Fallback: if it's just a job ID directly
      if (qrData.startsWith('JOB-')) {
        return qrData;
      }

      return null;
    } catch (e) {
      return null;
    }
  }
}
