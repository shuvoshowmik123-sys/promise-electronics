import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../providers/job_provider.dart';
import '../../../providers/user_provider.dart';
import '../../providers/auth_provider.dart';
import '../../../providers/inventory_provider.dart';
import '../../../data/models/job_ticket_model.dart';

class JobDetailSheet extends StatefulWidget {
  final JobTicketModel job;

  const JobDetailSheet({super.key, required this.job});

  @override
  State<JobDetailSheet> createState() => _JobDetailSheetState();
}

class _JobDetailSheetState extends State<JobDetailSheet> {
  late String _status;
  String? _technician;
  String? _notes;
  double _estimatedCost = 0.0;
  bool _isUpdating = false;

  final List<String> _statuses = ['Pending', 'In Progress', 'Assigned', 'Completed', 'Cancelled', 'Delivered'];

  @override
  void initState() {
    super.initState();
    _status = widget.job.status;
    _technician = widget.job.assignedTechnician;
    
    // Ensure technicians are loaded
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<UserProvider>().fetchUsers();
      context.read<InventoryProvider>().fetchProducts();
    });
    _notes = widget.job.notes;
    _estimatedCost = widget.job.estimatedCost ?? 0.0;
  }

  Future<void> _updateStatus(String newStatus) async {
    setState(() => _isUpdating = true);
    final success = await context.read<JobProvider>().updateStatus(widget.job.id, newStatus);
    if (mounted) {
      setState(() => _isUpdating = false);
      if (success) {
        setState(() => _status = newStatus);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Status Updated")));
      }
    }
  }

  Future<void> _assignTechnician(String? techName) async {
    if (techName == null) return;
    setState(() => _isUpdating = true);
    final success = await context.read<JobProvider>().assignTechnician(widget.job.id, techName);
    if (mounted) {
      setState(() => _isUpdating = false);
      if (success) {
        setState(() => _technician = techName);
         // Auto update status to Assigned if needed? 
         if (_status == 'Pending') {
           _updateStatus('Assigned'); 
         }
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Assigned to $techName")));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    // Determine colors
    Color statusColor = JobTicketModel.statusColors[_status] != null 
        ? Color(JobTicketModel.statusColors[_status]!) 
        : Colors.grey;

    return Container(
      padding: EdgeInsets.only(
        left: 20, 
        right: 20, 
        top: 20, 
        bottom: MediaQuery.of(context).viewInsets.bottom + 20
      ),
      constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
      decoration: const BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            // Handle
            Center(
              child: Container(
                width: 50, height: 5,
                decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2.5)),
              ),
            ),
            const SizedBox(height: 20),

            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(widget.job.id, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text("Ticket: ${widget.job.ticketNumber}", style: TextStyle(color: Colors.grey.shade600)),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: statusColor.withOpacity(0.5)),
                  ),
                  child: Text(_status, style: TextStyle(color: statusColor, fontWeight: FontWeight.bold)),
                ),
              ],
            ),
            const Divider(height: 32),

            // Controls
            const Text("Manage Ticket", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 12),
            Row(
              children: [
                // Status Dropdown
                Expanded(
                  child: DropdownButtonFormField<String>(
                    value: _statuses.contains(_status) ? _status : null,
                    isExpanded: true,
                    isDense: true,
                    decoration: const InputDecoration(labelText: "Status", border: OutlineInputBorder()),
                    items: _statuses.map((s) => DropdownMenuItem(value: s, child: Text(s, overflow: TextOverflow.ellipsis))).toList(),
                    selectedItemBuilder: (ctx) => _statuses.map((s) => Text(s, overflow: TextOverflow.ellipsis)).toList(),
                    onChanged: _isUpdating ? null : (val) {
                      if (val != null && val != _status) _updateStatus(val);
                    },
                  ),
                ),
                const SizedBox(width: 12),
                
                // Technician Dropdown
                Expanded(
                  child: Consumer<UserProvider>(
                    builder: (context, userProvider, _) {
                      final techs = userProvider.technicians;
                      // Extract names
                      final techNames = techs.map((t) => t['name'].toString()).toSet().toList(); // unique
                      
                      final isTechnician = context.read<AuthProvider>().user?.role == 'Technician';

                      return DropdownButtonFormField<String>(
                        value: (techNames.contains(_technician)) ? _technician : null,
                        isExpanded: true,
                        isDense: true,
                        decoration: const InputDecoration(labelText: "Technician", border: OutlineInputBorder()),
                        hint: const Text("Assign Tech"),
                        items: techNames.map((t) => DropdownMenuItem(value: t, child: Text(t, overflow: TextOverflow.ellipsis))).toList(),
                        selectedItemBuilder: (ctx) => techNames.map((t) => Text(t, overflow: TextOverflow.ellipsis)).toList(),
                        onChanged: (_isUpdating || isTechnician) ? null : (val) => _assignTechnician(val),
                      );
                    },
                  ),
                ),
              ],
            ),
            const SizedBox(height: 24),
            
            // Spare Parts Section
            const Text("Spare Parts & Cost", style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 12),
            _buildPartsSection(), 
            const SizedBox(height: 24),

            // Details
            _buildDetailRow(Icons.person, "Customer", widget.job.customerName),
            _buildDetailRow(Icons.phone, "Phone", widget.job.customerPhone),
            _buildDetailRow(Icons.devices, "Device", "${widget.job.deviceBrand} ${widget.job.deviceModel}"),
            _buildDetailRow(Icons.bug_report, "Issue", widget.job.issueDescription),
             if (widget.job.customerAddress != null)
            _buildDetailRow(Icons.location_on, "Address", widget.job.customerAddress!),
             
             const SizedBox(height: 12),
             Text("Created: ${widget.job.createdAt.toString().split('.')[0]}", style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
          ],
        ),
      ),
    );
  }

  Widget _buildPartsSection() {
    return Consumer<InventoryProvider>(
      builder: (context, invProvider, _) {
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
             Text("Estimated Cost: \৳${_estimatedCost.toStringAsFixed(2)}", style: const TextStyle(fontSize: 15, fontWeight: FontWeight.bold, color: Colors.green)),
             const SizedBox(height: 8),
             if (_notes != null && _notes!.contains('[Part]'))
                Container(
                  padding: const EdgeInsets.all(8),
                  color: Colors.grey.shade100,
                  child: Text(_notes!, style: const TextStyle(fontSize: 13, fontFamily: 'monospace')),
                ),
             const SizedBox(height: 8),
             ElevatedButton.icon(
               icon: const Icon(Icons.add_shopping_cart, size: 18),
               label: const Text("Add Part from Inventory"),
               onPressed: () => _showAddPartDialog(context, invProvider.products),
               style: ElevatedButton.styleFrom(
                 backgroundColor: Colors.blue.shade50,
                 foregroundColor: Colors.blue.shade800,
                 elevation: 0,
               ),
             ),
          ],
        );
      }
    );
  }

  void _showAddPartDialog(BuildContext context, List<dynamic> products) {
    if (products.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("No inventory loaded")));
        return;
    }
    
    // Filter only In Stock items
    final inStock = products.where((p) => (p['stock'] ?? 0) > 0).toList();
    
    dynamic selectedPart;
    
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text("Select Part"),
        content: StatefulBuilder(
          builder: (context, setState) {
             return Column(
               mainAxisSize: MainAxisSize.min,
               children: [
                 DropdownButtonFormField<dynamic>(
                    isExpanded: true,
                    items: inStock.map((p) => DropdownMenuItem(
                      value: p,
                      child: Text("${p['name']} (\৳${p['price']})", overflow: TextOverflow.ellipsis),
                    )).toList(),
                    onChanged: (val) {
                      setState(() => selectedPart = val);
                    },
                    decoration: const InputDecoration(labelText: "Part", border: OutlineInputBorder()),
                 ),
                 if (selectedPart != null)
                   Padding(
                     padding: const EdgeInsets.only(top: 10),
                     child: Text("Stock: ${selectedPart['stock']}", style: const TextStyle(color: Colors.green)),
                   ),
               ],
             );
          },
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () async {
              if (selectedPart == null) return;
              Navigator.pop(ctx);
              await _consumePart(selectedPart);
            },
            child: const Text("Add & Deduct Stock"),
          ),
        ],
      ),
    );
  }

  Future<void> _consumePart(dynamic part) async {
    setState(() => _isUpdating = true);
    
    // 1. Deduct Stock
    final success = await context.read<InventoryProvider>().updateStock(part['id'], (part['stock'] as int) - 1);
    
    if (success) {
      // 2. Update Job Cost & Notes
      double price = (part['price'] is int) ? (part['price'] as int).toDouble() : (part['price'] as double);
      double newCost = _estimatedCost + price;
      String newNotes = (_notes ?? "") + "\n[Part] ${part['name']} - Cost: \৳$price | Used by: CurrentUser"; 
      
      final jobSuccess = await context.read<JobProvider>().updateJob(widget.job.id, {
        'estimatedCost': newCost,
        'notes': newNotes
      });
      
      if (mounted) {
        setState(() => _isUpdating = false);
        if (jobSuccess) {
           setState(() {
             _estimatedCost = newCost;
             _notes = newNotes;
           });
           ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Added ${part['name']}")));
        } else {
           ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to update job details"))); 
        }
      }
    } else {
      if (mounted) {
        setState(() => _isUpdating = false);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text("Failed to deduct stock")));
      }
    }
  }

  Widget _buildDetailRow(IconData icon, String label, String value) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 20, color: Colors.grey.shade600),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
                Text(value, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w500)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
