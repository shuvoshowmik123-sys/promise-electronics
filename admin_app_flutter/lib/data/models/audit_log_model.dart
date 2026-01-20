class AuditLog {
  final String id;
  final String userId;
  final String action;
  final String entity;
  final String entityId;
  final String? details;
  final DateTime createdAt;
  final Map<String, dynamic>? changes;
  final Map<String, dynamic>? metadata;
  final String severity;

  AuditLog({
    required this.id,
    required this.userId,
    required this.action,
    required this.entity,
    required this.entityId,
    this.details,
    required this.createdAt,
    this.changes,
    this.metadata,
    this.severity = 'info',
  });

  factory AuditLog.fromJson(Map<String, dynamic> json) {
    return AuditLog(
      id: json['id'],
      userId: json['userId'] ?? 'Unknown',
      action: json['action'] ?? 'UNKNOWN',
      entity: json['entity'] ?? 'Unknown',
      entityId: json['entityId'] ?? '',
      details: json['details'],
      createdAt: json['createdAt'] != null 
          ? DateTime.parse(json['createdAt']) 
          : DateTime.now(),
      changes: json['changes'] as Map<String, dynamic>?,
      metadata: json['metadata'] as Map<String, dynamic>?,
      severity: json['severity'] ?? 'info',
    );
  }
}
