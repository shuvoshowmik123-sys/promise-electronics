import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../presentation/providers/auth_provider.dart';
import '../../data/models/user_model.dart';

/// Utility class for checking user permissions.
/// Use this to conditionally hide/show UI elements.
class PermissionManager {
  static UserPermissions? _getPermissions(BuildContext context) {
    return context.read<AuthProvider>().user?.permissions;
  }

  static String? _getRole(BuildContext context) {
    return context.read<AuthProvider>().user?.role;
  }

  // Role-based checks
  static bool isSuperAdmin(BuildContext context) {
    return _getRole(context) == 'Super Admin';
  }

  static bool isManager(BuildContext context) {
    return _getRole(context) == 'Manager' || isSuperAdmin(context);
  }

  static bool isTechnician(BuildContext context) {
    return _getRole(context) == 'Technician';
  }

  // Permission-based checks
  static bool canViewDashboard(BuildContext context) {
    return _getPermissions(context)?.dashboard ?? false;
  }

  static bool canViewJobs(BuildContext context) {
    return _getPermissions(context)?.jobs ?? false;
  }

  static bool canViewFinance(BuildContext context) {
    return _getPermissions(context)?.finance ?? false;
  }

  static bool canViewInventory(BuildContext context) {
    return _getPermissions(context)?.inventory ?? false;
  }

  static bool canViewUsers(BuildContext context) {
    return _getPermissions(context)?.users ?? false;
  }

  static bool canViewSettings(BuildContext context) {
    return _getPermissions(context)?.settings ?? false;
  }

  static bool canViewReports(BuildContext context) {
    return _getPermissions(context)?.reports ?? false;
  }

  static bool canViewPOS(BuildContext context) {
    return _getPermissions(context)?.pos ?? false;
  }

  // Action-based checks
  static bool canCreate(BuildContext context) {
    return _getPermissions(context)?.canCreate ?? false;
  }

  static bool canEdit(BuildContext context) {
    return _getPermissions(context)?.canEdit ?? false;
  }

  static bool canDelete(BuildContext context) {
    return _getPermissions(context)?.canDelete ?? false;
  }

  static bool canExport(BuildContext context) {
    return _getPermissions(context)?.canExport ?? false;
  }

  // Combined checks for Admin tab visibility
  static bool canAccessAdminTab(BuildContext context) {
    return isManager(context) || 
           canViewUsers(context) || 
           canViewSettings(context);
  }
}
