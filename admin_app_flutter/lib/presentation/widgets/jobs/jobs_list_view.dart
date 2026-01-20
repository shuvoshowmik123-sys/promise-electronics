import 'package:flutter/material.dart';
import '../../../data/models/job_ticket_model.dart';

class JobsListView extends StatefulWidget {
  const JobsListView({super.key});

  @override
  State<JobsListView> createState() => _JobsListViewState();
}

class _JobsListViewState extends State<JobsListView> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  
  // Mock data for now - will be replaced with API calls
  final List<JobTicketModel> _allJobs = [
    JobTicketModel(
      id: '1',
      ticketNumber: 'JT-2026-001',
      customerName: 'Shamsul Alam',
      customerPhone: '01711223344',
      customerAddress: 'Mirpur-10, Dhaka',
      deviceBrand: 'Samsung',
      deviceModel: '55" Crystal UHD',
      issueType: 'Display Issue',
      issueDescription: 'Panel showing vertical lines',
      status: 'In Progress',
      priority: 'High',
      assignedTechnician: 'Rahim',
      createdAt: DateTime.now().subtract(const Duration(days: 2)),
    ),
    JobTicketModel(
      id: '2',
      ticketNumber: 'JT-2026-002',
      customerName: 'Karim Uddin',
      customerPhone: '01899887766',
      customerAddress: 'Dhanmondi, Dhaka',
      deviceBrand: 'LG',
      deviceModel: '43" Smart TV',
      issueType: 'Power Issue',
      issueDescription: 'TV not turning on',
      status: 'Pending',
      priority: 'Medium',
      createdAt: DateTime.now().subtract(const Duration(hours: 5)),
    ),
    JobTicketModel(
      id: '3',
      ticketNumber: 'JT-2026-003',
      customerName: 'Rafiq Ahmed',
      customerPhone: '01555667788',
      customerAddress: 'Uttara, Dhaka',
      deviceBrand: 'Sony',
      deviceModel: '65" OLED',
      issueType: 'Sound Issue',
      issueDescription: 'No audio output',
      status: 'Completed',
      priority: 'Low',
      assignedTechnician: 'Karim',
      createdAt: DateTime.now().subtract(const Duration(days: 5)),
      updatedAt: DateTime.now().subtract(const Duration(days: 1)),
    ),
  ];

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 4, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  List<JobTicketModel> _filterJobs(String status) {
    if (status == 'All') return _allJobs;
    return _allJobs.where((job) => job.status == status).toList();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabController,
            labelColor: Colors.blue.shade700,
            unselectedLabelColor: Colors.grey.shade600,
            indicatorColor: Colors.blue.shade700,
            tabs: const [
              Tab(text: 'All'),
              Tab(text: 'Pending'),
              Tab(text: 'Active'),
              Tab(text: 'Done'),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildJobsList(_filterJobs('All')),
              _buildJobsList(_filterJobs('Pending')),
              _buildJobsList(_filterJobs('In Progress')),
              _buildJobsList(_filterJobs('Completed')),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildJobsList(List<JobTicketModel> jobs) {
    if (jobs.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.inbox_outlined, size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(
              'No jobs found',
              style: TextStyle(
                fontSize: 18,
                color: Colors.grey.shade600,
              ),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () async {
        // TODO: Refresh from API
        await Future.delayed(const Duration(seconds: 1));
      },
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: jobs.length,
        itemBuilder: (context, index) => _buildJobCard(jobs[index]),
      ),
    );
  }

  Widget _buildJobCard(JobTicketModel job) {
    final statusColor = Color(JobTicketModel.statusColors[job.status] ?? 0xFF9E9E9E);
    final priorityColor = Color(JobTicketModel.priorityColors[job.priority] ?? 0xFFFFB74D);

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
      ),
      child: InkWell(
        onTap: () {
          // TODO: Navigate to Job Details
        },
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header Row
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.blue.shade50,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      job.ticketNumber,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: Colors.blue.shade700,
                      ),
                    ),
                  ),
                  const Spacer(),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      job.status,
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: statusColor,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Customer Name
              Text(
                job.customerName,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 4),

              // Device Info
              Row(
                children: [
                  Icon(Icons.tv, size: 14, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    '${job.deviceBrand} ${job.deviceModel}',
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade700,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 4),

              // Issue Type
              Row(
                children: [
                  Icon(Icons.build_circle_outlined, size: 14, color: Colors.grey.shade600),
                  const SizedBox(width: 4),
                  Text(
                    job.issueType,
                    style: TextStyle(
                      fontSize: 13,
                      color: Colors.grey.shade700,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),

              // Footer Row
              Row(
                children: [
                  // Priority Badge
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: priorityColor.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(
                      job.priority,
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                        color: priorityColor,
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (job.assignedTechnician != null) ...[
                    Icon(Icons.person_outline, size: 14, color: Colors.grey.shade500),
                    const SizedBox(width: 2),
                    Text(
                      job.assignedTechnician!,
                      style: TextStyle(
                        fontSize: 11,
                        color: Colors.grey.shade600,
                      ),
                    ),
                  ],
                  const Spacer(),
                  Icon(Icons.arrow_forward_ios, size: 14, color: Colors.grey.shade400),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
