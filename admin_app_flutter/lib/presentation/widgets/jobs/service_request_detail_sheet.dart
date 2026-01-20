import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../providers/service_request_provider.dart';

class ServiceRequestDetailSheet extends StatefulWidget {
  final Map<String, dynamic> request;

  const ServiceRequestDetailSheet({super.key, required this.request});

  @override
  State<ServiceRequestDetailSheet> createState() => _ServiceRequestDetailSheetState();
}

class _ServiceRequestDetailSheetState extends State<ServiceRequestDetailSheet> {
  late String _status;
  late String _trackingStatus;
  bool _isUpdating = false;

  final List<String> _statuses = ['Pending', 'Reviewed', 'Cancelled', 'Converted'];
  final List<String> _trackingStatuses = [
    "Request Received", "Arriving to Receive", "Awaiting Drop-off", "Queued",
    "Received", "Technician Assigned", "Diagnosis Completed", "Parts Pending",
    "Repairing", "Ready for Delivery", "Delivered", "Cancelled"
  ];

  @override
  void initState() {
    super.initState();
    _status = widget.request['status'] ?? 'Pending';
    _trackingStatus = widget.request['trackingStatus'] ?? 'Request Received';
  }

  Future<void> _updateField(String key, String value) async {
    setState(() => _isUpdating = true);
    final success = await context.read<ServiceRequestProvider>().updateRequest(
      widget.request['id'], 
      {key: value}
    );
    if (success) {
      if (mounted) {
        setState(() {
          if (key == 'status') _status = value;
          if (key == 'trackingStatus') _trackingStatus = value;
          _isUpdating = false;
        });
        ScaffoldMessenger.of(context).showSnackBar(
           const SnackBar(content: Text('Updated successfully')),
        );
      }
    } else {
       if (mounted) {
        setState(() => _isUpdating = false);
        ScaffoldMessenger.of(context).showSnackBar(
           const SnackBar(content: Text('Update failed'), backgroundColor: Colors.red),
        );
       }
    }
  }

  Future<void> _convertToJob() async {
    // Logic: Set status to 'Converted'. Backend handles creation.
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Convert to Job?"),
        content: const Text("This will create a Job Ticket and move this request to the Job Board for technician assignment."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text("Cancel")),
          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text("Convert")),
        ],
      ),
    );

    if (confirm == true) {
      await _updateField('status', 'Converted');
      if (mounted) Navigator.pop(context); // Close sheet on conversion
    }
  }

  @override
  Widget build(BuildContext context) {
    final req = widget.request;
    final customer = req['customerName'] ?? 'Unknown';
    final phone = req['phone'] ?? 'N/A';
    final address = req['address'] ?? 'N/A';
    final issue = req['primaryIssue'] ?? 'N/A';
    final desc = req['description'] ?? 'No description';
    final brand = req['brand'] ?? 'N/A';

    return Container(
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Center(
              child: Container(
                width: 40, 
                height: 4, 
                decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text("Ticket #${req['ticketNumber'] ?? req['id']}", style: TextStyle(color: Colors.grey.shade600, fontWeight: FontWeight.bold)),
                IconButton(onPressed: () => Navigator.pop(context), icon: const Icon(Icons.close)),
              ],
            ),
            
            Text(issue, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            
            // Editing Section
            // Editing Section
            const Divider(),
            const Text("Actions", style: TextStyle(fontWeight: FontWeight.bold, color: Colors.blue)),
            const SizedBox(height: 12),
            Row(
              children: [
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _statuses.contains(_status) ? _status : null,
                    isExpanded: true,
                    isDense: true,
                    // Disable status change if already converted (Forward-only enforcement)
                    onChanged: _status == 'Converted' ? null : (val) {
                      if (val != null && val != _status) _updateField('status', val);
                    },
                    decoration: InputDecoration(
                      labelText: "Status", 
                      border: const OutlineInputBorder(), 
                      contentPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
                      fillColor: _status == 'Converted' ? Colors.grey.shade100 : null,
                      filled: _status == 'Converted',
                    ),
                    items: _statuses.map((s) => DropdownMenuItem(value: s, child: Text(s, overflow: TextOverflow.ellipsis))).toList(),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _trackingStatuses.contains(_trackingStatus) ? _trackingStatus : null,
                    isExpanded: true,
                    isDense: true,
                    decoration: const InputDecoration(labelText: "Tracking", border: OutlineInputBorder(), contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 12)),
                    items: _trackingStatuses.map((s) => DropdownMenuItem(
                      value: s, 
                      child: Text(s == 'Received' ? 'Received (at Service Center)' : s, overflow: TextOverflow.ellipsis)
                    )).toList(),
                    selectedItemBuilder: (context) {
                      return _trackingStatuses.map((s) {
                        return Text(s == 'Received' ? 'Received (at Service Center)' : s, overflow: TextOverflow.ellipsis, maxLines: 1);
                      }).toList();
                    },
                    onChanged: (val) {
                      if (val != null && val != _trackingStatus) _updateField('trackingStatus', val);
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            
            if (_status != 'Converted')
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: _isUpdating ? null : _convertToJob,
                  icon: const Icon(Icons.build_circle_outlined),
                  label: const Text("Convert to Job Ticket"),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.indigo,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              )
            else
               Container(
                 width: double.infinity,
                 padding: const EdgeInsets.all(12),
                 decoration: BoxDecoration(color: Colors.green.shade50, borderRadius: BorderRadius.circular(8)),
                 child: Row(
                   mainAxisAlignment: MainAxisAlignment.center,
                   children: const [
                     Icon(Icons.check_circle, size: 16, color: Colors.green),
                     SizedBox(width: 8),
                     Text("Converted to Job Ticket", style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                   ],
                 ),
               ),
            const SizedBox(height: 8),
            
            const Divider(height: 32),
            
            // Details
            _buildDetailRow(Icons.person, "Customer", customer),
            _buildDetailRow(Icons.phone, "Phone", phone),
            _buildDetailRow(Icons.location_on, "Address", address),
            const SizedBox(height: 16),
            _buildDetailRow(Icons.tv, "Device", "$brand ${req['modelNumber'] ?? ''}"),
            const SizedBox(height: 16),
            const Text("Description", style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text(desc, style: TextStyle(color: Colors.grey.shade700)),
            
            const SizedBox(height: 24),
            // Safety padding for bottom sheet
            SizedBox(height: MediaQuery.of(context).viewInsets.bottom),
          ],
        ),
      ),
    );
  }

  Widget _buildDetailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 18, color: Colors.grey),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: TextStyle(fontSize: 12, color: Colors.grey.shade500)),
                Text(value, style: const TextStyle(fontWeight: FontWeight.w500)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
