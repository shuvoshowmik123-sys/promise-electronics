import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../providers/audit_provider.dart';
import '../../data/models/audit_log_model.dart';

class AuditLogsScreen extends StatefulWidget {
  const AuditLogsScreen({super.key});

  @override
  State<AuditLogsScreen> createState() => _AuditLogsScreenState();
}

class _AuditLogsScreenState extends State<AuditLogsScreen> {
  final TextEditingController _userFilterController = TextEditingController();
  final TextEditingController _entityFilterController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AuditProvider>().fetchLogs();
    });
  }

  void _applyFilters() {
    context.read<AuditProvider>().fetchLogs(
      userId: _userFilterController.text.isEmpty ? null : _userFilterController.text,
      entity: _entityFilterController.text.isEmpty ? null : _entityFilterController.text,
    );
  }

  void _showDiffDialog(AuditLog log) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Change Details: ${log.action}'),
        content: SizedBox(
          width: 600,
          height: 500,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text("Entity: ${log.entity} (${log.entityId})", style: const TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 5),
                Text("User: ${log.userId}"),
                Text("Date: ${DateFormat('yyyy-MM-dd HH:mm:ss').format(log.createdAt)}"),
                const Divider(),
                if (log.changes != null) ...[
                   _buildDiffView(log.changes!),
                ] else ...[
                   const Text("No detailed changes recorded.", style: TextStyle(fontStyle: FontStyle.italic)),
                   if (log.details != null) Padding(
                     padding: const EdgeInsets.only(top: 8.0),
                     child: Text("Details: ${log.details}"),
                   ),
                ]
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text("Close")),
        ],
      ),
    );
  }

  Widget _buildDiffView(Map<String, dynamic> changes) {
      final oldData = changes['old'] as Map<String, dynamic>?;
      final newData = changes['new'] as Map<String, dynamic>?;

      if (oldData == null && newData == null) return const Text("No changes");

      // Valid keys from both maps
      final keys = <String>{};
      if (oldData != null) keys.addAll(oldData.keys);
      if (newData != null) keys.addAll(newData.keys);

      if (keys.isEmpty) return const Text("No field changes detected.");

      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
            const Text("Field Changes:", style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Table(
                border: TableBorder.all(color: Colors.grey.shade300),
                columnWidths: const {
                    0: FlexColumnWidth(1.2),
                    1: FlexColumnWidth(2),
                    2: FlexColumnWidth(2),
                },
                children: [
                    TableRow(
                        decoration: BoxDecoration(color: Colors.grey.shade100),
                        children: const [
                            Padding(padding: EdgeInsets.all(8.0), child: Text("Field", style: TextStyle(fontWeight: FontWeight.bold))),
                            Padding(padding: EdgeInsets.all(8.0), child: Text("Old Value", style: TextStyle(fontWeight: FontWeight.bold))),
                            Padding(padding: EdgeInsets.all(8.0), child: Text("New Value", style: TextStyle(fontWeight: FontWeight.bold))),
                        ]
                    ),
                    ...keys.map((key) {
                        final oldVal = oldData?[key]?.toString() ?? '-';
                        final newVal = newData?[key]?.toString() ?? '-';
                        final isDiff = oldVal != newVal;
                        
                        // Skip if no difference (though usually backend only sends diffs)
                        if (!isDiff && oldData != null && newData != null) {
                            return const TableRow(children: [SizedBox(), SizedBox(), SizedBox()]); // Hacky skip
                        } else if (!isDiff) {
                           // If backend sent it, maybe we show it? Standard is clear comparison.
                        }

                        // We render only if diff or if one is missing
                        return TableRow(
                            decoration: isDiff ? BoxDecoration(color: Colors.yellow.shade50) : null,
                            children: [
                                Padding(padding: const EdgeInsets.all(8.0), child: Text(key, style: const TextStyle(fontWeight: FontWeight.w500))),
                                Padding(padding: const EdgeInsets.all(8.0), child: Text(oldVal, style: isDiff ? TextStyle(color: Colors.red.shade700) : null)),
                                Padding(padding: const EdgeInsets.all(8.0), child: Text(newVal, style: isDiff ? TextStyle(color: Colors.green.shade700) : null)),
                            ]
                        );
                    }).where((row) => row.children.length == 3 && (row.children[0] is! SizedBox)).toList(), // Correctly filter
                ],
            )
        ],
      );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("System Logs"),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => context.read<AuditProvider>().fetchLogs(),
          )
        ],
      ),
      body: Column(
        children: [
          // Filter Bar
          Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                Expanded(
                  child: TextField(
                    controller: _userFilterController,
                    decoration: const InputDecoration(
                      labelText: 'User ID',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: TextField(
                    controller: _entityFilterController,
                    decoration: const InputDecoration(
                      labelText: 'Entity Type',
                      border: OutlineInputBorder(),
                      contentPadding: EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                ElevatedButton.icon(
                  onPressed: _applyFilters,
                  icon: const Icon(Icons.filter_list),
                  label: const Text("Filter"),
                )
              ],
            ),
          ),
          
          Expanded(
            child: Consumer<AuditProvider>(
              builder: (context, provider, child) {
                if (provider.isLoading) {
                  return const Center(child: CircularProgressIndicator());
                }
                if (provider.error != null) {
                  return Center(child: Text('Error: ${provider.error}', style: const TextStyle(color: Colors.red)));
                }
                if (provider.logs.isEmpty) {
                  return const Center(child: Text("No logs found."));
                }

                return SingleChildScrollView(
                  scrollDirection: Axis.vertical,
                  child: SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    child: DataTable(
                      columns: const [
                        DataColumn(label: Text('Date/Time')),
                        DataColumn(label: Text('Action')),
                        DataColumn(label: Text('Entity')),
                        DataColumn(label: Text('User')),
                        DataColumn(label: Text('Details')),
                        DataColumn(label: Text('Actions')),
                      ],
                      rows: provider.logs.map((log) => DataRow(cells: [
                        DataCell(Text(DateFormat('MM-dd HH:mm').format(log.createdAt))),
                        DataCell(Text(log.action, style: TextStyle(
                            color: log.action.contains('DELETE') ? Colors.red : 
                                   log.action.contains('CREATE') ? Colors.green : Colors.blue
                        ))),
                        DataCell(Text(log.entity)),
                        DataCell(Text(log.userId)),
                        DataCell(SizedBox(width: 200, child: Text(log.details ?? '-', overflow: TextOverflow.ellipsis))),
                        DataCell(IconButton(
                          icon: const Icon(Icons.visibility),
                          tooltip: 'View Diff',
                          onPressed: () => _showDiffDialog(log),
                        )),
                      ])).toList(),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
