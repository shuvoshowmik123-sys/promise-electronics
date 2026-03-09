class BootstrapModel {
  final Map<String, dynamic> user;
  final Map<String, dynamic>? assignedWorkLocation;
  final ModulePermissions modules;
  final Map<String, dynamic>? attendance;
  final WorkStatusBanner workStatus;
  final UnreadCounts unreadCounts;
  final BranchInfo? branch;
  final HomeSummary homeSummary;

  BootstrapModel({
    required this.user,
    this.assignedWorkLocation,
    required this.modules,
    this.attendance,
    required this.workStatus,
    required this.unreadCounts,
    this.branch,
    required this.homeSummary,
  });

  factory BootstrapModel.fromJson(Map<String, dynamic> json) {
    return BootstrapModel(
      user: json['user'] ?? {},
      assignedWorkLocation: json['assignedWorkLocation'],
      modules: ModulePermissions.fromJson(json['modules'] ?? {}),
      attendance: json['attendance'],
      workStatus: WorkStatusBanner.fromJson(json['workStatus'] ?? {}),
      unreadCounts: UnreadCounts.fromJson(json['unreadCounts'] ?? {}),
      branch: json['branch'] != null ? BranchInfo.fromJson(json['branch']) : null,
      homeSummary: HomeSummary.fromJson(json['homeSummary'] ?? {}),
    );
  }
}

class ModulePermissions {
  final bool attendance;
  final bool jobs;
  final bool notifications;
  final bool superAdmin;

  ModulePermissions({
    required this.attendance,
    required this.jobs,
    required this.notifications,
    required this.superAdmin,
  });

  factory ModulePermissions.fromJson(Map<String, dynamic> json) {
    return ModulePermissions(
      attendance: json['attendance'] ?? false,
      jobs: json['jobs'] ?? false,
      notifications: json['notifications'] ?? false,
      superAdmin: json['superAdmin'] ?? false,
    );
  }
}

class WorkStatusBanner {
  final String statusText;
  final String subText;
  final String statusColor;
  final String icon;
  final bool actionRequired;

  WorkStatusBanner({
    required this.statusText,
    required this.subText,
    required this.statusColor,
    required this.icon,
    required this.actionRequired,
  });

  factory WorkStatusBanner.fromJson(Map<String, dynamic> json) {
    return WorkStatusBanner(
      statusText: (json['statusText'] ?? json['label'] ?? 'Unknown Status').toString(),
      subText: (json['subText'] ?? json['message'] ?? '').toString(),
      statusColor: (json['statusColor'] ?? json['variant'] ?? 'neutral').toString(),
      icon: (json['icon'] ?? 'info_outline').toString(),
      actionRequired: json['actionRequired'] ?? false,
    );
  }
}

class UnreadCounts {
  final int notifications;

  UnreadCounts({required this.notifications});

  factory UnreadCounts.fromJson(Map<String, dynamic> json) {
    return UnreadCounts(
      notifications: json['notifications'] ?? 0,
    );
  }
}

class BranchInfo {
  final String id;
  final String name;
  final num radiusMeters;

  BranchInfo({
    required this.id,
    required this.name,
    required this.radiusMeters,
  });

  factory BranchInfo.fromJson(Map<String, dynamic> json) {
    return BranchInfo(
      id: (json['id'] ?? '').toString(),
      name: (json['name'] ?? '').toString(),
      radiusMeters: json['radiusMeters'] ?? 100,
    );
  }
}

class HomeSummary {
  final String primaryActionKey;
  final String primaryActionLabel;
  final String firstActionKey;
  final String firstActionLabel;
  final HomeCounters counters;
  final Map<String, dynamic>? firstJob;

  HomeSummary({
    required this.primaryActionKey,
    required this.primaryActionLabel,
    required this.firstActionKey,
    required this.firstActionLabel,
    required this.counters,
    this.firstJob,
  });

  factory HomeSummary.fromJson(Map<String, dynamic> json) {
    return HomeSummary(
      primaryActionKey: (json['primaryActionKey'] ?? 'none').toString(),
      primaryActionLabel: (json['primaryActionLabel'] ?? 'No action required').toString(),
      firstActionKey: (json['firstActionKey'] ?? 'none').toString(),
      firstActionLabel: (json['firstActionLabel'] ?? 'No action required').toString(),
      counters: HomeCounters.fromJson(json['counters'] ?? {}),
      firstJob: json['firstJob'],
    );
  }
}

class HomeCounters {
  final int jobs;
  final int urgentJobs;
  final int approvals;

  HomeCounters({
    required this.jobs,
    required this.urgentJobs,
    required this.approvals,
  });

  factory HomeCounters.fromJson(Map<String, dynamic> json) {
    return HomeCounters(
      jobs: json['jobs'] ?? 0,
      urgentJobs: json['urgentJobs'] ?? 0,
      approvals: json['approvals'] ?? 0,
    );
  }
}
