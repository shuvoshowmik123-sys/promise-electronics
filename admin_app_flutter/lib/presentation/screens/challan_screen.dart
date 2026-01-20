import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/challan_provider.dart';
import '../widgets/skeletons/list_skeleton.dart';
import 'create_challan_screen.dart';

class ChallanScreen extends StatefulWidget {
  const ChallanScreen({super.key});

  @override
  State<ChallanScreen> createState() => _ChallanScreenState();
}

class _ChallanScreenState extends State<ChallanScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChallanProvider>().fetchChallans();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          Navigator.push(context, MaterialPageRoute(builder: (_) => const CreateChallanScreen()));
        },
        backgroundColor: Colors.blue.shade700,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.note_add),
        label: const Text('New Challan'),
      ),
      body: Consumer<ChallanProvider>(
        builder: (context, provider, child) {
          if (provider.isLoading) {
            return const ListSkeleton();
          }

          if (provider.challans.isEmpty) {
            return Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.description_outlined, size: 64, color: Colors.grey.shade300),
                  const SizedBox(height: 16),
                  Text('No Challans Found', style: TextStyle(color: Colors.grey.shade500)),
                ],
              ),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: provider.challans.length,
            itemBuilder: (context, index) {
              final doc = provider.challans[index];
              final status = doc['status'] ?? 'Pending';
              final isDelivered = status == 'Delivered' || status == 'Paid' || status == 'Completed';
              
              return Card(
                elevation: 0,
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                  side: BorderSide(color: Colors.grey.shade200),
                ),
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: isDelivered ? Colors.green.shade50 : Colors.orange.shade50,
                    child: Icon(
                      Icons.description,
                      color: isDelivered ? Colors.green : Colors.orange,
                    ),
                  ),
                  title: Text(
                    doc['id']?.toString() ?? 'Unknown ID',
                    style: const TextStyle(fontWeight: FontWeight.bold),
                  ),
                  subtitle: Text(doc['receiverName'] ?? 'Unknown Receiver'),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(
                        status,
                        style: TextStyle(
                          color: isDelivered ? Colors.green : Colors.orange,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _formatDate(doc['date']),
                        style: TextStyle(fontSize: 10, color: Colors.grey.shade600),
                      ),
                    ],
                  ),
                  onTap: () {
                    // Open Details / Download PDF
                  },
                ),
              );
            },
          );
        },
      ),
    );
  }

  String _formatDate(String? date) {
    if (date == null) return '';
    try {
      final dt = DateTime.parse(date);
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (e) {
      return date; // fallback to string if simple text
    }
  }
}
