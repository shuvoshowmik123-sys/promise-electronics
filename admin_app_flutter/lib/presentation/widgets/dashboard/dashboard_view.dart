import 'package:flutter/material.dart';
import 'package:flutter_staggered_grid_view/flutter_staggered_grid_view.dart';
import 'package:provider/provider.dart';
import '../../../core/utils/permission_manager.dart';
import '../../../providers/dashboard_provider.dart';
import 'bento_tile.dart';
import 'revenue_chart.dart';
import '../skeletons/dashboard_skeleton.dart';

class DashboardView extends StatefulWidget {
  const DashboardView({super.key});

  @override
  State<DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends State<DashboardView> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardProvider>().fetchStats();
    });
  }

  @override
  Widget build(BuildContext context) {
    final canViewFinance = PermissionManager.canViewFinance(context);

    return Consumer<DashboardProvider>(
      builder: (context, provider, child) {
        if (provider.isLoading) {
          return const DashboardSkeleton();
        }

        final activeJobs = provider.activeJobs;
        final revenue = provider.revenue;
        final activeTechs = provider.activeTechs;
        final lowStock = provider.lowStockItems;

        return SingleChildScrollView(
          padding: const EdgeInsets.all(20), // Increased padding
          child: Column(
            children: [
              // 2x2 Stats Grid with Gradients
              StaggeredGrid.count(
                crossAxisCount: 2,
                mainAxisSpacing: 16,
                crossAxisSpacing: 16,
                children: [
                  StaggeredGridTile.count(
                    crossAxisCellCount: 1,
                    mainAxisCellCount: 1,
                    child: _buildGradientTile(
                      'Active Jobs', 
                      activeJobs, 
                      Icons.work_outline, 
                      [Colors.blue.shade400, Colors.blue.shade700],
                    ),
                  ),
                  StaggeredGridTile.count(
                    crossAxisCellCount: 1,
                    mainAxisCellCount: 1,
                    child: canViewFinance
                        ? _buildGradientTile(
                            'Revenue', 
                            '৳ $revenue', 
                            Icons.attach_money, 
                            [Colors.green.shade400, Colors.green.shade700],
                          )
                        : _buildGradientTile(
                            'Pending', 
                            '0', 
                            Icons.pending_actions, 
                            [Colors.orange.shade400, Colors.orange.shade700],
                          ),
                  ),
                  StaggeredGridTile.count(
                    crossAxisCellCount: 1,
                    mainAxisCellCount: 1,
                    child: _buildGradientTile(
                      'Active Techs', 
                      activeTechs, 
                      Icons.engineering_outlined, 
                      [Colors.purple.shade400, Colors.purple.shade700],
                    ),
                  ),
                  StaggeredGridTile.count(
                    crossAxisCellCount: 1,
                    mainAxisCellCount: 1,
                    child: _buildGradientTile(
                      'Low Stock', 
                      '$lowStock Items', 
                      Icons.warning_amber_rounded, 
                      [Colors.red.shade400, Colors.red.shade700],
                    ),
                  ),
                ],
              ),
              
              const SizedBox(height: 32),
              
              // Quick Actions Title
              const Align(
                alignment: Alignment.centerLeft,
                child: Text(
                  'Quick Actions',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              
              // Horizontal Quick Actions
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  children: [
                     _buildQuickActionPill(Icons.add, 'New Job', Colors.blue),
                     const SizedBox(width: 8),
                     _buildQuickActionPill(Icons.qr_code_scanner, 'Scan QR', Colors.black),
                     const SizedBox(width: 8),
                     _buildQuickActionPill(Icons.person_add, 'Customer', Colors.orange),
                     const SizedBox(width: 8),
                     _buildQuickActionPill(Icons.description, 'Invoice', Colors.teal),
                  ],
                ),
              ),

              const SizedBox(height: 24),

              // Recent Requests
              _buildRecentRequestsTile(),
            ],
          ),
        );
      },
    );
  }

  Widget _buildRecentRequestsTile() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey.shade50,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.history, color: Colors.grey.shade700),
              const SizedBox(width: 8),
              Text(
                'Recent Requests',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                  color: Colors.grey.shade800,
                ),
              ),
              const Spacer(),
              TextButton(
                onPressed: () {},
                child: const Text('View All'),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ListView(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            padding: EdgeInsets.zero,
            children: [
              _buildRequestItem(
                'Samsung TV Repair',
                'Shamsul Alam',
                'Pending',
                Colors.orange,
              ),
              _buildRequestItem(
                'LG Panel Issue',
                'Karim Uddin',
                'In Progress',
                Colors.blue,
              ),
              _buildRequestItem(
                'Sony Backlight',
                'Rafiq Ahmed',
                'Completed',
                Colors.green,
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildRequestItem(String title, String customer, String status, Color statusColor) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontWeight: FontWeight.w500,
                  ),
                  overflow: TextOverflow.ellipsis,
                  maxLines: 1,
                ),
                Text(
                  customer,
                  style: TextStyle(
                    fontSize: 12,
                    color: Colors.grey.shade600,
                  ),
                ),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              status,
              style: TextStyle(
                fontSize: 11,
                color: statusColor,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildGradientTile(String title, String value, IconData icon, List<Color> colors) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: colors,
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: colors.last.withOpacity(0.4),
            blurRadius: 12,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.white.withOpacity(0.2),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: Colors.white, size: 24),
          ),
          const SizedBox(height: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                value,
                style: const TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                  color: Colors.white,
                  letterSpacing: -0.5,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                title,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.white.withOpacity(0.9),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildQuickActionPill(IconData icon, String label, Color color) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Colors.grey.shade200),
      ),
      child: Row(
        children: [
          Icon(icon, size: 20, color: color),
          const SizedBox(width: 8),
          Text(
            label,
            style: TextStyle(
              fontWeight: FontWeight.w600,
              color: Colors.grey.shade800,
            ),
          ),
        ],
      ),
    );
  }
}
