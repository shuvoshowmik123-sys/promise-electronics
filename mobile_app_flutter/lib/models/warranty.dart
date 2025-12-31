class Warranty {
  final String jobId;
  final String device;
  final String issue;
  final String completedAt;
  final WarrantyDetails serviceWarranty;
  final WarrantyDetails partsWarranty;

  Warranty({
    required this.jobId,
    required this.device,
    required this.issue,
    required this.completedAt,
    required this.serviceWarranty,
    required this.partsWarranty,
  });

  factory Warranty.fromJson(Map<String, dynamic> json) {
    return Warranty(
      jobId: json['jobId']?.toString() ?? '',
      device: json['device']?.toString() ?? '',
      issue: json['issue']?.toString() ?? '',
      completedAt: json['completedAt']?.toString() ?? '',
      serviceWarranty: WarrantyDetails.fromJson(
          json['serviceWarranty'] as Map<String, dynamic>),
      partsWarranty: WarrantyDetails.fromJson(
          json['partsWarranty'] as Map<String, dynamic>),
    );
  }
}

class WarrantyDetails {
  final int days;
  final String? expiryDate;
  final bool isActive;
  final int remainingDays;

  WarrantyDetails({
    required this.days,
    this.expiryDate,
    required this.isActive,
    required this.remainingDays,
  });

  factory WarrantyDetails.fromJson(Map<String, dynamic> json) {
    return WarrantyDetails(
      days: json['days'] as int? ?? 0,
      expiryDate: json['expiryDate']?.toString(),
      isActive: json['isActive'] as bool? ?? false,
      remainingDays: json['remainingDays'] as int? ?? 0,
    );
  }
}
