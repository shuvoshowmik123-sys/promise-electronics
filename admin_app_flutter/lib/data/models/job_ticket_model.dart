class JobTicketModel {
  final String id;
  final String ticketNumber;
  final String customerName;
  final String customerPhone;
  final String? customerAddress;
  final String deviceBrand;
  final String deviceModel;
  final String issueType;
  final String issueDescription;
  final String status;
  final String priority;
  final String? assignedTechnician;
  final String? notes;
  final double? estimatedCost;
  final DateTime createdAt;
  final DateTime? updatedAt;

  JobTicketModel({
    required this.id,
    required this.ticketNumber,
    required this.customerName,
    required this.customerPhone,
    this.customerAddress,
    required this.deviceBrand,
    required this.deviceModel,
    required this.issueType,
    required this.issueDescription,
    required this.status,
    required this.priority,
    this.assignedTechnician,
    this.notes,
    this.estimatedCost,
    required this.createdAt,
    this.updatedAt,
  });

  factory JobTicketModel.fromJson(Map<String, dynamic> json) {
    return JobTicketModel(
      id: json['id'] ?? '',
      ticketNumber: json['ticketNumber'] ?? '',
      customerName: json['customerName'] ?? '',
      customerPhone: json['customerPhone'] ?? '',
      customerAddress: json['customerAddress'],
      deviceBrand: json['deviceBrand'] ?? 'Unknown',
      deviceModel: json['deviceModel'] ?? '',
      issueType: json['issueType'] ?? 'Other',
      issueDescription: json['issueDescription'] ?? '',
      status: json['status'] ?? 'Pending',
      priority: json['priority'] ?? 'Medium',
      assignedTechnician: json['assignedTechnician'] ?? json['technician'],
      notes: json['notes'],
      estimatedCost: (json['estimatedCost'] != null) ? (json['estimatedCost'] as num).toDouble() : null,
      createdAt: DateTime.tryParse(json['createdAt'] ?? '') ?? DateTime.now(),
      updatedAt: json['updatedAt'] != null 
          ? DateTime.tryParse(json['updatedAt']) 
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'ticketNumber': ticketNumber,
      'customerName': customerName,
      'customerPhone': customerPhone,
      'customerAddress': customerAddress,
      'deviceBrand': deviceBrand,
      'deviceModel': deviceModel,
      'issueType': issueType,
      'issueDescription': issueDescription,
      'status': status,
      'priority': priority,
      'assignedTechnician': assignedTechnician,
      'notes': notes,
      'estimatedCost': estimatedCost,
      'createdAt': createdAt.toIso8601String(),
      'updatedAt': updatedAt?.toIso8601String(),
    };
  }

  // Status color helper
  static Map<String, int> statusColors = {
    'Pending': 0xFFFFA726,      // Orange
    'In Progress': 0xFF2196F3,  // Blue
    'Completed': 0xFF4CAF50,    // Green
    'Cancelled': 0xFF9E9E9E,    // Grey
  };

  // Priority color helper  
  static Map<String, int> priorityColors = {
    'Low': 0xFF81C784,          // Light Green
    'Medium': 0xFFFFB74D,       // Orange
    'High': 0xFFE57373,         // Red
  };
}
