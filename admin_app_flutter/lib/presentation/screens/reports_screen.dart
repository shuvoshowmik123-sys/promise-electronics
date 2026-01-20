import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:provider/provider.dart';
import '../../providers/dashboard_provider.dart';
import '../widgets/skeletons/dashboard_skeleton.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DashboardProvider>().fetchStats();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Consumer<DashboardProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading) {
            return const DashboardSkeleton();
          }

          final revenue = provider.revenue;
          final activeJobs = provider.activeJobs;
          final techs = provider.activeTechs;

          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildHeader(),
                const SizedBox(height: 24),
                // 1. Stats Grid
                LayoutBuilder(
                  builder: (context, constraints) {
                    return Wrap(
                      spacing: 16,
                      runSpacing: 16,
                      children: [
                        _buildStatCard(
                          title: 'Total Revenue', 
                          value: revenue, // Pass numeric value
                          icon: Icons.attach_money, 
                          color: Colors.green,
                          width: (constraints.maxWidth - 16) / 2,
                          isCurrency: true,
                        ),
                        _buildStatCard(
                          title: 'Active Jobs', 
                          value: activeJobs, 
                          icon: Icons.work_history, 
                          color: Colors.blue,
                          width: (constraints.maxWidth - 16) / 2
                        ),
                        _buildStatCard(
                          title: 'Technicians', 
                          value: techs, 
                          icon: Icons.engineering, 
                          color: Colors.orange,
                          width: (constraints.maxWidth - 16) / 2
                        ),
                        _buildStatCard(
                          title: 'Inventory Value', 
                          value: 240000, 
                          icon: Icons.inventory, 
                          color: Colors.purple,
                          width: (constraints.maxWidth - 16) / 2,
                          isCurrency: true,
                        ),
                      ],
                    );
                  }
                ),
                
                const SizedBox(height: 32),
                
                // 2. Chart Section
                const Text(
                  'Weekly Activity',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                ),
                const SizedBox(height: 16),
                _buildChartContainer(),

                 const SizedBox(height: 32),
                 SizedBox(
                   height: 50,
                   child: ElevatedButton.icon(
                     onPressed: () {},
                     icon: const Icon(Icons.download),
                     label: const Text('Export PDF Report'),
                     style: ElevatedButton.styleFrom(
                       backgroundColor: Colors.grey.shade800,
                       foregroundColor: Colors.white,
                     ),
                   ),
                 ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
         const Column(
           crossAxisAlignment: CrossAxisAlignment.start,
           children: [
             Text('Reports & Analytics', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
             Text('Real-time business insights', style: TextStyle(color: Colors.grey)),
           ],
         ),
         Container(
           padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
           decoration: BoxDecoration(
             color: Colors.blue.shade50,
             borderRadius: BorderRadius.circular(20)
           ),
           child: Row(
             children: [
               Icon(Icons.calendar_today, size: 14, color: Colors.blue.shade700),
               const SizedBox(width: 6),
               Text('This Month', style: TextStyle(color: Colors.blue.shade700, fontWeight: FontWeight.bold)),
             ],
           ),
         )
      ],
    );
  }

  Widget _buildStatCard({
    required String title, 
    dynamic value, // String or num
    required IconData icon, 
    required Color color,
    required double width,
    bool isCurrency = false,
  }) {
    return Container(
      width: width,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [
          BoxShadow(
             color: color.withOpacity(0.05),
             blurRadius: 10,
             offset: const Offset(0, 4)
          )
        ]
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12)
            ),
            child: Icon(icon, color: color),
          ),
          const SizedBox(height: 16),
          // Animated Value
          if (value is num)
            TweenAnimationBuilder<double>(
              tween: Tween<double>(begin: 0, end: value.toDouble()),
              duration: const Duration(seconds: 2),
              curve: Curves.easeOutExpo,
              builder: (context, val, child) {
                String formatted = val.toInt().toString();
                if (isCurrency) {
                   // Simple currency format
                   formatted = '৳ ${val.toInt()}';
                }
                return Text(formatted, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold));
              },
            )
          else
            Text(value.toString(), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          
          const SizedBox(height: 4),
          Text(title, style: TextStyle(color: Colors.grey.shade600, fontSize: 13)),
        ],
      ),
    );
  }

  Widget _buildChartContainer() {
    return TweenAnimationBuilder<double>(
      tween: Tween(begin: 0, end: 1),
      duration: const Duration(milliseconds: 1500),
      curve: Curves.elasticOut,
      builder: (context, anim, child) {
        return Container(
          height: 300,
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(color: Colors.grey.shade100),
          ),
          child: BarChart(
            BarChartData(
              gridData: const FlGridData(show: false),
              titlesData: FlTitlesData(
                leftTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                bottomTitles: AxisTitles(
                  sideTitles: SideTitles(
                    showTitles: true,
                    getTitlesWidget: (value, meta) {
                      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                      if (value.toInt() >= 0 && value.toInt() < days.length) {
                        return Text(days[value.toInt()], style: const TextStyle(fontSize: 12, color: Colors.grey));
                      }
                      return const Text('');
                    },
                  ),
                ),
              ),
              borderData: FlBorderData(show: false),
              barGroups: [
                _makeGroupData(0, 5 * anim, 12 * anim),
                _makeGroupData(1, 16 * anim, 12 * anim),
                _makeGroupData(2, 10 * anim, 20 * anim),
                _makeGroupData(3, 20 * anim, 14 * anim),
                _makeGroupData(4, 17 * anim, 13 * anim),
                _makeGroupData(5, 12 * anim, 10 * anim),
                _makeGroupData(6, 15 * anim, 15 * anim),
              ],
            ),
          ),
        );
      },
    );
  }

  BarChartGroupData _makeGroupData(int x, double y1, double y2) {
    return BarChartGroupData(
      x: x,
      barRods: [
        BarChartRodData(
          toY: y1,
          color: Colors.blue.shade400,
          width: 8,
          borderRadius: BorderRadius.circular(4),
        ),
        BarChartRodData(
          toY: y2,
          color: Colors.orange.shade400,
          width: 8,
          borderRadius: BorderRadius.circular(4),
        ),
      ],
    );
  }
}
