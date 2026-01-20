import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/job_provider.dart';
import '../../data/models/job_ticket_model.dart';
import '../widgets/skeletons/job_card_skeleton.dart';
import 'package:intl/intl.dart';
import '../widgets/jobs/job_detail_sheet.dart';

class JobTicketsScreen extends StatefulWidget {
  const JobTicketsScreen({super.key});

  @override
  State<JobTicketsScreen> createState() => _JobTicketsScreenState();
}

class _JobTicketsScreenState extends State<JobTicketsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<JobProvider>().fetchJobs();
    });
  }

  void _showJobDetails(JobTicketModel job) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => JobDetailSheet(job: job),
    ).then((_) {
       // Refresh list after closing sheet in case of changes
       context.read<JobProvider>().fetchJobs();
    });
  }

  bool _isNew(DateTime createdAt) {
    return DateTime.now().difference(createdAt).inHours < 24;
  }

  String _formatDate(DateTime date) {
    return DateFormat('dd MMM yyyy, hh:mm a').format(date.toLocal());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _buildHeader(),
            const SizedBox(height: 24),
            Expanded(
              child: Consumer<JobProvider>(
                builder: (context, provider, child) {
                  if (provider.isLoading) {
                    return ListView.builder(
                      physics: const NeverScrollableScrollPhysics(),
                      padding: const EdgeInsets.all(0),
                      itemCount: 6,
                      itemBuilder: (context, index) => const JobCardSkeleton(),
                    );
                  }
                  
                  if (provider.error != null) {
                    return RefreshIndicator(
                      onRefresh: () => context.read<JobProvider>().fetchJobs(),
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        child: SizedBox(
                          height: MediaQuery.of(context).size.height * 0.7,
                          child: Center(child: Text(provider.error!, style: const TextStyle(color: Colors.red))),
                        ),
                      ),
                    );
                  }

                  if (provider.jobs.isEmpty) {
                    return RefreshIndicator(
                      onRefresh: () => context.read<JobProvider>().fetchJobs(),
                      child: SingleChildScrollView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        child: SizedBox(
                          height: MediaQuery.of(context).size.height * 0.7,
                          child: const Center(child: Text("No active Job Tickets")),
                        ),
                      ),
                    );
                  }

                  return RefreshIndicator(
                    onRefresh: () => context.read<JobProvider>().fetchJobs(),
                    child: ListView.builder(
                      physics: const AlwaysScrollableScrollPhysics(),
                      itemCount: provider.jobs.length,
                      itemBuilder: (context, index) {
                        final job = provider.jobs[index];
                        return _buildJobCard(job);
                      },
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Job Tickets', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              Text('Manage repairs and technician assignments', style: TextStyle(color: Colors.grey)),
            ],
          ),
        ),
        ElevatedButton.icon(
          onPressed: () {
            // TODO: Create manual job?
          },
          icon: const Icon(Icons.add),
          label: const Text('New Job'),
          style: ElevatedButton.styleFrom(
            backgroundColor: Colors.blue.shade700,
            foregroundColor: Colors.white,
          ),
        ),
      ],
    );
  }

  Widget _buildJobCard(JobTicketModel job) {
    Color statusColor = JobTicketModel.statusColors[job.status] != null 
        ? Color(JobTicketModel.statusColors[job.status]!) 
        : Colors.grey;

    Color priorityColor = JobTicketModel.priorityColors[job.priority] != null 
        ? Color(JobTicketModel.priorityColors[job.priority]!) 
        : Colors.grey;

    bool isNew = _isNew(job.createdAt);
    String displayId = job.ticketNumber.isNotEmpty ? job.ticketNumber : job.id;

    return Card(
      elevation: 2,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        onTap: () => _showJobDetails(job),
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon / Priority Strip
              Container(
                width: 4,
                height: 80, // Increased height for added content
                decoration: BoxDecoration(
                  color: priorityColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const SizedBox(width: 16),
              
              // Content
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceBetween,
                      children: [
                        Row(
                          children: [
                            Text(displayId, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                            if (isNew) ...[
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                decoration: BoxDecoration(
                                  color: Colors.red.shade600,
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text('NEW', style: TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                              ),
                            ],
                          ],
                        ),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: statusColor.withOpacity(0.1),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(job.status, style: TextStyle(color: statusColor, fontSize: 12, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    Text("${job.deviceBrand} ${job.deviceModel} • ${job.issueType}", style: const TextStyle(fontSize: 14)),
                    const SizedBox(height: 6),
                    // Date
                    Row(
                      children: [
                        Icon(Icons.calendar_today, size: 12, color: Colors.grey.shade500),
                         const SizedBox(width: 4),
                        Text(_formatDate(job.createdAt), style: TextStyle(fontSize: 12, color: Colors.grey.shade600)),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Icon(Icons.person, size: 14, color: Colors.grey.shade600),
                        const SizedBox(width: 4),
                        Text(job.customerName, style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                        const SizedBox(width: 16),
                        Icon(Icons.engineering, size: 14, color: Colors.grey.shade600),
                        const SizedBox(width: 4),
                        Text(job.assignedTechnician ?? 'Unassigned', style: TextStyle(fontSize: 13, color: Colors.grey.shade600)),
                      ],
                    ),
                  ],
                ),
              ),
               const SizedBox(width: 8),
               const Icon(Icons.chevron_right, color: Colors.grey),
            ],
          ),
        ),
      ),
    );
  }
}
