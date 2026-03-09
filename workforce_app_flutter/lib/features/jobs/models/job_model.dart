class JobModel {
  final String id;
  final String deviceName;
  final String customerName;
  final String? customerPhone;
  final String issueDescription;
  final String status;
  final String priority;
  final String? assignedToName;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<JobNoteModel> notes;

  JobModel({
    required this.id,
    required this.deviceName,
    required this.customerName,
    this.customerPhone,
    required this.issueDescription,
    required this.status,
    required this.priority,
    this.assignedToName,
    required this.createdAt,
    required this.updatedAt,
    this.notes = const [],
  });

  factory JobModel.fromJson(Map<String, dynamic> json) {
    return JobModel(
      id: json['id']?.toString() ?? '',
      deviceName: json['device']?.toString() ?? json['deviceName']?.toString() ?? 'Unknown Device',
      customerName: json['customer']?.toString() ?? json['customerName']?.toString() ?? 'Unknown Customer',
      customerPhone: json['customerPhone']?.toString(),
      issueDescription: json['issueDescription']?.toString() ?? 'No description provided.',
      status: json['status']?.toString() ?? 'Pending',
      priority: json['priority']?.toString() ?? 'Normal',
      assignedToName: json['assignedToName']?.toString(),
      createdAt: json['createdAt'] != null ? DateTime.parse(json['createdAt'].toString()) : DateTime.now(),
      updatedAt: json['updatedAt'] != null ? DateTime.parse(json['updatedAt'].toString()) : DateTime.now(),
      notes: json['notes'] != null 
          ? (json['notes'] as List).map((n) => JobNoteModel.fromJson(n)).toList()
          : [],
    );
  }
}

class JobNoteModel {
  final String id;
  final String text;
  final String authorName;
  final DateTime createdAt;
  final bool isMedia;
  final String? mediaUrl;

  JobNoteModel({
    required this.id,
    required this.text,
    required this.authorName,
    required this.createdAt,
    this.isMedia = false,
    this.mediaUrl,
  });

  factory JobNoteModel.fromJson(Map<String, dynamic> json) {
    return JobNoteModel(
      id: json['id']?.toString() ?? '',
      text: json['text']?.toString() ?? '',
      authorName: json['authorName']?.toString() ?? 'Unknown',
      createdAt: json['createdAt'] != null ? DateTime.parse(json['createdAt'].toString()) : DateTime.now(),
      isMedia: json['isMedia'] ?? false,
      mediaUrl: json['mediaUrl']?.toString(),
    );
  }
}
