import 'dart:convert';

class UserModel {
  final String id;
  final String username;
  final String name;
  final String? email;
  final String? phone;
  final String role;
  final String status;
  final UserPermissions permissions;
  final String? profileImageUrl;

  UserModel({
    required this.id,
    required this.username,
    required this.name,
    this.email,
    this.phone,
    required this.role,
    required this.status,
    required this.permissions,
    this.profileImageUrl,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    // Parse permissions from string if needed, or object if already parsed
    UserPermissions perms;
    final roleName = (json['role'] ?? 'Customer').toString();

    if (json['permissions'] != null) {
      try {
        if (json['permissions'] is String) {
          perms = UserPermissions.fromJson(jsonDecode(json['permissions']));
        } else if (json['permissions'] is Map) {
          perms = UserPermissions.fromJson(json['permissions']);
        } else {
           perms = _getDefaultPermissions(roleName);
        }
      } catch (e) {
        perms = _getDefaultPermissions(roleName);
      }
    } else {
      perms = _getDefaultPermissions(roleName);
    }

    return UserModel(
      id: json['id'] ?? '',
      username: json['username'] ?? '',
      name: json['name'] ?? '',
      email: json['email'],
      phone: json['phone'],
      role: roleName,
      status: json['status'] ?? 'Active',
      permissions: perms,
      profileImageUrl: json['profile_image_url'] ?? json['avatar'],
    );
  }

  static UserPermissions _getDefaultPermissions(String role) {
    if (role == 'Admin' || role == 'Manager') {
      return UserPermissions(
        dashboard: true,
        jobs: true,
        inventory: true,
        pos: true,
        challans: true,
        finance: true,
        attendance: true,
        reports: true,
        serviceRequests: true,
        orders: true,
        technician: true,
        inquiries: true,
        systemHealth: true,
        users: true,
        settings: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        canExport: true,
        canViewFullJobDetails: true,
        canPrintJobTickets: true,
      );
    } else if (role == 'Technician') {
      return UserPermissions(
        dashboard: false, // Default to false or maybe specific tech dashboard?
        jobs: true,
        inventory: false, // Maybe view only?
        pos: false,
        challans: false,
        finance: false,
        attendance: true,
        reports: false,
        serviceRequests: true, // Can see requests to pick up?
        orders: false,
        technician: true, // Technician View enabled by default
        inquiries: false,
        systemHealth: false,
        users: false,
        settings: false,
        canCreate: false,
        canEdit: true, // Edit assigned jobs
        canDelete: false,
        canExport: false,
        canViewFullJobDetails: true,
        canPrintJobTickets: false,
      );
    }
    // Default / Customer
    return UserPermissions();
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'username': username,
      'name': name,
      'email': email,
      'phone': phone,
      'role': role,
      'status': status,
      'permissions': permissions.toJson(),
      'profile_image_url': profileImageUrl,
    };
  }
}

class UserPermissions {
  final bool dashboard;
  final bool jobs;
  final bool inventory;
  final bool pos;
  final bool challans;
  final bool finance;
  final bool attendance;
  final bool reports;
  final bool serviceRequests;
  final bool orders;
  final bool technician;
  final bool inquiries;
  final bool systemHealth;
  final bool users;
  final bool settings;
  final bool canCreate;
  final bool canEdit;
  final bool canDelete;
  final bool canExport;
  final bool canViewFullJobDetails;
  final bool canPrintJobTickets;

  UserPermissions({
    this.dashboard = false,
    this.jobs = false,
    this.inventory = false,
    this.pos = false,
    this.challans = false,
    this.finance = false,
    this.attendance = false,
    this.reports = false,
    this.serviceRequests = false,
    this.orders = false,
    this.technician = false,
    this.inquiries = false,
    this.systemHealth = false,
    this.users = false,
    this.settings = false,
    this.canCreate = false,
    this.canEdit = false,
    this.canDelete = false,
    this.canExport = false,
    this.canViewFullJobDetails = false,
    this.canPrintJobTickets = false,
  });

  factory UserPermissions.fromJson(Map<String, dynamic> json) {
    return UserPermissions(
      dashboard: json['dashboard'] == true,
      jobs: json['jobs'] == true,
      inventory: json['inventory'] == true,
      pos: json['pos'] == true,
      challans: json['challans'] == true,
      finance: json['finance'] == true,
      attendance: json['attendance'] == true,
      reports: json['reports'] == true,
      serviceRequests: json['serviceRequests'] == true,
      orders: json['orders'] == true,
      technician: json['technician'] == true,
      inquiries: json['inquiries'] == true,
      systemHealth: json['systemHealth'] == true,
      users: json['users'] == true,
      settings: json['settings'] == true,
      canCreate: json['canCreate'] == true,
      canEdit: json['canEdit'] == true,
      canDelete: json['canDelete'] == true,
      canExport: json['canExport'] == true,
      canViewFullJobDetails: json['canViewFullJobDetails'] == true,
      canPrintJobTickets: json['canPrintJobTickets'] == true,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'dashboard': dashboard,
      'jobs': jobs,
      'inventory': inventory,
      'pos': pos,
      'challans': challans,
      'finance': finance,
      'attendance': attendance,
      'reports': reports,
      'serviceRequests': serviceRequests,
      'orders': orders,
      'technician': technician,
      'inquiries': inquiries,
      'systemHealth': systemHealth,
      'users': users,
      'settings': settings,
      'canCreate': canCreate,
      'canEdit': canEdit,
      'canDelete': canDelete,
      'canExport': canExport,
      'canViewFullJobDetails': canViewFullJobDetails,
      'canPrintJobTickets': canPrintJobTickets,
    };
  }
}
