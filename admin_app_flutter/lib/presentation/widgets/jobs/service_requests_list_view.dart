import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../providers/service_request_provider.dart';
import 'service_request_detail_sheet.dart';
import '../skeletons/job_card_skeleton.dart';
import 'package:intl/intl.dart';

class ServiceRequestsList extends StatefulWidget {
  const ServiceRequestsList({super.key});

  @override
  State<ServiceRequestsList> createState() => _ServiceRequestsListState();
}

class _ServiceRequestsListState extends State<ServiceRequestsList> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ServiceRequestProvider>().fetchRequests();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<ServiceRequestProvider>(
      builder: (context, provider, child) {
        if (provider.isLoading) {
          return ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            itemCount: 6,
            itemBuilder: (context, index) => const JobCardSkeleton(),
          );
        }

        if (provider.error != null) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 16),
                Text('Error: ${provider.error}'),
                TextButton(
                  onPressed: () => provider.fetchRequests(),
                  child: const Text('Retry'),
                ),
              ],
            ),
          );
        }

        final all = provider.requests;
        final quotes = all.where((r) => r['requestIntent'] == 'quote').toList();
        final serviceRequests = all.where((r) => r['requestIntent'] != 'quote').toList();

        return DefaultTabController(
          length: 3,
          child: Column(
            children: [
              Container(
                color: Colors.white,
                child: TabBar(
                  labelColor: Colors.blue.shade700,
                  unselectedLabelColor: Colors.grey.shade600,
                  indicatorColor: Colors.blue.shade700,
                  indicatorWeight: 3,
                  labelStyle: const TextStyle(fontWeight: FontWeight.bold),
                  tabs: [
                    const Tab(text: "All"),
                    Tab(text: "Quotes (${quotes.length})"),
                    Tab(text: "Requests (${serviceRequests.length})"),
                  ],
                ),
              ),
              Expanded(
                child: TabBarView(
                  children: [
                    _buildList(all, "No Service Requests Found"),
                    _buildList(quotes, "No Quote Requests Found"),
                    _buildList(serviceRequests, "No Regular Service Requests"),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildList(List<dynamic> requests, String emptyMessage) {
    if (requests.isEmpty) {
      return RefreshIndicator(
        onRefresh: () => context.read<ServiceRequestProvider>().fetchRequests(),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          child: SizedBox(
            height: MediaQuery.of(context).size.height * 0.7,
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.inbox, size: 64, color: Colors.grey),
                  const SizedBox(height: 16),
                  Text(emptyMessage, style: const TextStyle(color: Colors.grey)),
                ],
              ),
            ),
          ),
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => context.read<ServiceRequestProvider>().fetchRequests(),
      child: ListView.builder(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        itemCount: requests.length,
        physics: const AlwaysScrollableScrollPhysics(),
        itemBuilder: (context, index) {
          final req = requests[index];
          return _buildPromiseCard(context, req);
        },
      ),
    );
  }

  Widget _buildPromiseCard(BuildContext context, Map<String, dynamic> req) {
    final title = req['primaryIssue'] ?? req['issueDescription'] ?? req['title'] ?? 'Service Request';
    final customer = req['customerName'] ?? req['customer']?['name'] ?? 'Unknown Customer';
    final status = req['status'] ?? 'Pending';
    final date = req['createdAt'] ?? '';
    final ticketNumber = req['ticketNumber'] ?? req['id'].toString();
    final device = "${req['brand'] ?? ''} ${req['modelNumber'] ?? ''}".trim();
    final intent = req['requestIntent'];

    // Standardized Status Colors
    Color statusColor;
    Color statusBg;
    switch (status.toString().toLowerCase()) {
      case 'completed':
      case 'converted':
      case 'closed':
        statusColor = const Color(0xFF10B981); // Emerald
        statusBg = const Color(0xFFECFDF5);
        break;
      case 'in_progress':
      case 'assigned':
      case 'repairing':
      case 'quoted':
        statusColor = const Color(0xFF3B82F6); // Blue
        statusBg = const Color(0xFFEFF6FF);
        break;
      case 'cancelled':
      case 'declined':
        statusColor = const Color(0xFFEF4444); // Red
        statusBg = const Color(0xFFFEF2F2);
        break;
      case 'pending':
      default:
        statusColor = const Color(0xFFF59E0B); // Amber
        statusBg = const Color(0xFFFFFBEB);
    }

    return Card(
      elevation: 2,
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: () {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (context) => ServiceRequestDetailSheet(request: req),
          );
        },
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Header: Ticket #, Intent, Status
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                       Text(
                        '#$ticketNumber',
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: Colors.grey.shade600,
                        ),
                      ),
                      if (intent == 'quote') ...[
                        const SizedBox(width: 8),
                         Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: Colors.purple.shade50,
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: Colors.purple.shade200),
                          ),
                          child: Text(
                            "QUOTE",
                            style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.purple.shade700),
                          ),
                        )
                      ]
                    ],
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusBg,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(
                      status.toString().toUpperCase().replaceAll('_', ' '),
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.bold,
                        color: statusColor,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              
              // Device Info & Title
              if (device.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Text(
                    device,
                    style: const TextStyle(fontSize: 12, color: Colors.blueGrey, fontWeight: FontWeight.w600),
                  ),
                ),

              Text(
                title,
                style: const TextStyle(
                  fontSize: 15, 
                  fontWeight: FontWeight.bold,
                  color: Colors.black87,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 12),
              
              const Divider(height: 1),
              const SizedBox(height: 12),

              // Footer: Customer & Date
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Row(
                    children: [
                      Icon(Icons.person_outline, size: 14, color: Colors.grey.shade600),
                      const SizedBox(width: 4),
                      Text(
                        customer,
                        style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w500,
                          color: Colors.black87,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ],
                  ),
                  if (date.toString().isNotEmpty)
                    Row(
                      children: [
                        Icon(Icons.calendar_today_outlined, size: 12, color: Colors.grey.shade400),
                        const SizedBox(width: 4),
                        Text(
                          DateFormat('dd MMM yyyy').format(DateTime.parse(date.toString()).toLocal()),
                          style: TextStyle(fontSize: 12, color: Colors.grey.shade500),
                        ),
                      ],
                    ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
