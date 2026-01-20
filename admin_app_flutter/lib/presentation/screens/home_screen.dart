import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/utils/permission_manager.dart';
import '../../data/models/user_model.dart';
import '../providers/auth_provider.dart';
import '../widgets/dashboard/dashboard_view.dart';
import '../widgets/jobs/service_requests_list_view.dart';
import '../widgets/admin_navigation_drawer.dart';
import '../screens/attendance_screen.dart';
import '../screens/pos_screen.dart';
import '../screens/inventory_screen.dart';
import '../screens/challan_screen.dart';
import '../screens/technician_dashboard.dart';
import '../screens/customer_list_screen.dart';
import '../screens/user_management_screen.dart';

import '../screens/reports_screen.dart';
import '../screens/settings_screen.dart';
import '../screens/create_service_request_screen.dart';
import '../screens/job_tickets_screen.dart'; 
import '../screens/finance_screen.dart'; // Import FinanceScreen
import '../screens/add_product_screen.dart'; // Restored import
import 'qr_scanner_screen.dart';
import 'audit_logs_screen.dart'; // Import AuditLogsScreen
import '../widgets/notification_bell.dart'; // Import NotificationBell

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _NavItem {
  final String title;
  final Widget widget;
  final NavigationDrawerDestination destination;

  _NavItem({
    required this.title,
    required this.widget,
    required this.destination,
  });
}

class _HomeScreenState extends State<HomeScreen> {
  int _currentIndex = 0;

  List<_NavItem> _buildNavItems(UserPermissions p, UserModel? user) {
    final items = <_NavItem>[];

    // PRIORITY: If user is NOT an admin (no dashboard access) OR is a Technician, show Technician View first
    // We enforce logical separation: Technicians see Technician View, Admins see Dashboard.
    final isTechnician = user?.role == 'Technician';
    
    if ((!p.dashboard || isTechnician) && p.jobs) {
      items.add(_NavItem(
        title: 'Technician View',
        widget: const TechnicianDashboard(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.engineering_outlined),
          selectedIcon: Icon(Icons.engineering),
          label: Text('Technician View'),
        ),
      ));
    }

    // 0. Admin Dashboard (Only for Admins)
    // STRICT: If role is Technician, NEVER show admin dashboard, even if p.dashboard is true.
    if (p.dashboard && !isTechnician) {
      items.add(_NavItem(
        title: 'Dashboard',
        widget: const DashboardView(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.dashboard_outlined),
          selectedIcon: Icon(Icons.dashboard),
          label: Text('Dashboard'),
        ),
      ));
    }

    // 1. Service Requests
    if (p.serviceRequests) {
      items.add(_NavItem(
        title: 'Service Requests',
        widget: const ServiceRequestsList(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.assignment_outlined),
          selectedIcon: Icon(Icons.assignment),
          label: Text('Service Requests'),
        ),
      ));
    }

    // 2. Job Tickets
    if (p.jobs && !isTechnician) {
      items.add(_NavItem(
        title: 'Job Tickets',
        widget: const JobTicketsScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.build_outlined),
          selectedIcon: Icon(Icons.build),
          label: Text('Job Tickets'),
        ),
      ));
    }
    
    // 3. POS
    if (p.pos) {
      items.add(_NavItem(
        title: 'Point of Sale',
        widget: const POSScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.point_of_sale_outlined),
          selectedIcon: Icon(Icons.point_of_sale),
          label: Text('POS'),
        ),
      ));
    }

    // 4. Inventory
    if (p.inventory) {
      items.add(_NavItem(
        title: 'Inventory',
        widget: const InventoryScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.inventory_2_outlined),
          selectedIcon: Icon(Icons.inventory_2),
          label: Text('Inventory'),
        ),
      ));
    }

    // 5. Challan
    if (p.challans) {
      items.add(_NavItem(
        title: 'Challan',
        widget: const ChallanScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.receipt_long_outlined),
          label: Text('Challan / Invoice'),
        ),
      ));
    }

    // 6. Finance
    if (p.finance) {
      items.add(_NavItem(
        title: 'Finance & Accounts',
        widget: const FinanceScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.attach_money_outlined),
          selectedIcon: Icon(Icons.attach_money),
          label: Text('Finance & Accounts'),
        ),
      ));
    }

    // 8. Customers
    // STRICT: Only show if they have explicit user/customer management permission
    if (p.users) { 
       items.add(_NavItem(
        title: 'Customers',
        widget: const CustomerListScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.person_search_outlined),
          selectedIcon: Icon(Icons.person_search),
          label: Text('Customers'),
        ),
      ));
    }

    // 9. Staff/Users
    if (p.users) {
      items.add(_NavItem(
        title: 'Staff Management',
        widget: const UserManagementScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.manage_accounts_outlined),
          selectedIcon: Icon(Icons.manage_accounts),
          label: Text('Staff & Users'),
        ),
      ));
    }

    // 10. Attendance
    if (p.attendance) {
      items.add(_NavItem(
        title: 'Attendance',
        widget: const AttendanceScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.people_outline),
          selectedIcon: Icon(Icons.people),
          label: Text('Staff Attendance'),
        ),
      ));
    }

    // 11. Reports
    if (p.reports) {
      items.add(_NavItem(
        title: 'Reports & Analytics',
        widget: const ReportsScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.bar_chart_outlined),
          selectedIcon: Icon(Icons.bar_chart),
          label: Text('Reports & Analytics'),
        ),
      ));
    }

    // 12. Settings
    if (p.settings) {
      items.add(_NavItem(
        title: 'Settings',
        widget: const SettingsScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.settings_outlined),
          selectedIcon: Icon(Icons.settings),
          label: Text('Settings'),
        ),
      ));
    }

    // System Logs (Restricted to Admins)

    if ((user?.role == 'Admin' || user?.role == 'Super Admin') && !isTechnician) {
      items.add(_NavItem(
        title: 'System Logs',
        widget: const AuditLogsScreen(),
        destination: const NavigationDrawerDestination(
          icon: Icon(Icons.history_edu_outlined),
          selectedIcon: Icon(Icons.history_edu),
          label: Text('System Logs'),
        ),
      ));
    }

    return items;
  }

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    // Default to empty permissions if user is null (shouldn't happen due to AuthWrapper)
    final permissions = user?.permissions ?? UserPermissions(); 
    
    final navItems = _buildNavItems(permissions, user);

    // If no items, show empty state or fallback?
    if (navItems.isEmpty) {
       return const Scaffold(body: Center(child: Text("Access Denied")));
    }

    final safeIndex = _currentIndex.clamp(0, navItems.length - 1);
    final currentItem = navItems[safeIndex];

    return Scaffold(
      drawer: AdminNavigationDrawer(
        selectedIndex: safeIndex,
        destinations: navItems.map((e) => e.destination).toList(),
        onDestinationSelected: (index) {
          setState(() {
            _currentIndex = index;
          });
          Navigator.pop(context); // Close drawer
        },
      ),
      appBar: AppBar(
        title: Text(currentItem.title),
        actions: [
          const NotificationBell(), // Real-time notification bell
          PopupMenuButton<String>(
            icon: CircleAvatar(
              radius: 16,
              backgroundColor: Colors.blue.shade100,
              child: Text(
                user?.name.isNotEmpty == true ? user!.name[0].toUpperCase() : 'A',
                style: TextStyle(
                  color: Colors.blue.shade700,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
            onSelected: (value) {
              if (value == 'logout') {
                context.read<AuthProvider>().logout();
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(
                enabled: false,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?.name ?? 'Admin',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: Colors.black87,
                      ),
                    ),
                    Text(
                      user?.role ?? 'Unknown Role',
                      style: TextStyle(
                        fontSize: 12,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                ),
              ),
              const PopupMenuDivider(),
              const PopupMenuItem(
                value: 'logout',
                child: Row(
                  children: [
                    Icon(Icons.logout, size: 20, color: Colors.red),
                    SizedBox(width: 8),
                    Text('Logout', style: TextStyle(color: Colors.red)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: currentItem.widget,
      floatingActionButton: _buildContextAwareFab(context, currentItem),
      floatingActionButtonLocation: FloatingActionButtonLocation.endFloat,
    );
  }

  Widget? _buildContextAwareFab(BuildContext context, _NavItem item) {
    // Logic based on widget type or title
    if (item.widget is InventoryScreen) {
        return FloatingActionButton(
        onPressed: () {
            Navigator.push(context, MaterialPageRoute(builder: (_) => const AddProductScreen()));
        },
        backgroundColor: Colors.blue.shade700,
        child: const Icon(Icons.inventory_2, color: Colors.white),
      );
    }
    
    if (item.widget is DashboardView) {
       return FloatingActionButton(
        onPressed: () => _showQuickActions(context),
        backgroundColor: Colors.indigo.shade900,
        child: const Icon(Icons.grid_view_rounded, color: Colors.white),
      );
    }

    if (item.widget is TechnicianDashboard) {
       return FloatingActionButton(
        onPressed: () => _showQuickActions(context),
        backgroundColor: Colors.indigo.shade900,
        child: const Icon(Icons.qr_code_scanner, color: Colors.white),
      );
    }

    return null;
  }

  void _showQuickActions(BuildContext context) {
    showModalBottomSheet(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 24),
            const Text(
              'Quick Actions',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [
                _buildQuickAction(
                  icon: Icons.add_circle_outline,
                  label: 'New Ticket',
                  color: Colors.blue,
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const CreateServiceRequestScreen()));
                  },
                ),
                _buildQuickAction(
                  icon: Icons.qr_code_scanner,
                  label: 'Scan QR',
                  color: Colors.green,
                  onTap: () {
                    Navigator.pop(context);
                    Navigator.push(context, MaterialPageRoute(builder: (_) => const QrScannerScreen()));
                  },
                ),
                _buildQuickAction(
                  icon: Icons.search,
                  label: 'Search',
                  color: Colors.orange,
                  onTap: () => Navigator.pop(context),
                ),
              ],
            ),
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildQuickAction({
    required IconData icon,
    required String label,
    required Color color,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Column(
          children: [
            Icon(icon, size: 32, color: color),
            const SizedBox(height: 8),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PlaceholderPage extends StatelessWidget {
  final String title;
  final IconData icon;

  const _PlaceholderPage({required this.title, required this.icon});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 64, color: Colors.grey.shade400),
          const SizedBox(height: 16),
          Text(
            title,
            style: TextStyle(
              fontSize: 24,
              color: Colors.grey.shade600,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Coming Soon',
            style: TextStyle(
              color: Colors.grey.shade400,
            ),
          ),
        ],
      ),
    );
  }
}
