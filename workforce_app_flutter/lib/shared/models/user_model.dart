class UserModel {
  final String id;
  final String name;
  final String username;
  final String role;

  UserModel({
    required this.id,
    required this.name,
    required this.username,
    required this.role,
  });

  String get displayName {
    if (name.trim().isNotEmpty) return name.trim();
    return username.trim();
  }

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? json['username'] ?? '').toString(),
      username: (json['username'] ?? json['name'] ?? '').toString(),
      role: (json['role'] ?? '').toString(),
    );
  }
}
