import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../providers/finance_provider.dart';

class DueRecordsTab extends StatelessWidget {
  const DueRecordsTab({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<FinanceProvider>(
      builder: (context, provider, child) {
        if (provider.isLoadingDue) {
          return const Center(child: CircularProgressIndicator());
        }

        final dues = provider.dueRecords; // Already sorted in provider

        return RefreshIndicator(
          onRefresh: () => provider.fetchDueRecords(),
          child: Scaffold(
            backgroundColor: Colors.transparent,
            body: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                 if (dues.isEmpty)
                    const Padding(padding: EdgeInsets.all(20), child: Center(child: Text("No Due Records"))),
  
                 ...dues.map((record) {
                   final amount = double.tryParse(record.amount) ?? 0;
                   final paid = double.tryParse(record.paidAmount ?? '0') ?? 0;
                   final remaining = amount - paid;
                   
                   return Card(
                     elevation: 1,
                     margin: const EdgeInsets.only(bottom: 8),
                     child: ExpansionTile(
                       title: Text(record.customer),
                       subtitle: Text("Inv: ${record.invoice ?? '-'} • Due: ৳${remaining.toStringAsFixed(0)}"),
                       trailing: Container(
                         padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                         decoration: BoxDecoration(
                           color: remaining <= 0 ? Colors.green.withOpacity(0.1) : Colors.red.withOpacity(0.1),
                           borderRadius: BorderRadius.circular(4),
                         ),
                         child: Text(
                           remaining <= 0 ? "Paid" : "Due",
                           style: TextStyle(
                             color: remaining <= 0 ? Colors.green : Colors.red,
                             fontWeight: FontWeight.bold,
                             fontSize: 12
                           ),
                         ),
                       ),
                       children: [
                         Padding(
                           padding: const EdgeInsets.all(16.0),
                           child: Column(
                             crossAxisAlignment: CrossAxisAlignment.stretch,
                             children: [
                               Text("Total Amount: ৳$amount"),
                               Text("Paid Amount: ৳$paid"),
                               const SizedBox(height: 10),
                               if (remaining > 0)
                                 ElevatedButton.icon(
                                   onPressed: () => _showSettleDialog(context, record, remaining),
                                   icon: const Icon(Icons.payment),
                                   label: const Text("Settle Payment"),
                                   style: ElevatedButton.styleFrom(
                                     backgroundColor: Colors.indigo,
                                     foregroundColor: Colors.white,
                                   ),
                                 ),
                             ],
                           ),
                         )
                       ],
                     ),
                   );
                 }).toList(),
              ],
            ),
            floatingActionButton: FloatingActionButton.extended(
              onPressed: () => _showAddDueDialog(context),
              label: const Text("Add Due Record"),
              icon: const Icon(Icons.add),
              backgroundColor: Colors.red.shade700,
              foregroundColor: Colors.white,
            ),
          ),
        );
      },
    );
  }

  void _showAddDueDialog(BuildContext context) {
    final _formKey = GlobalKey<FormState>();
    String customer = '';
    String amount = '';
    String invoice = '';
    
    showDialog(
      context: context,
      builder: (ctx) => Dialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        child: Container(
          width: MediaQuery.of(context).size.width * 0.85, 
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Header
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: Colors.red.shade50,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.receipt_long_rounded, color: Colors.red.shade700, size: 28),
                  ),
                  const SizedBox(width: 16),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text("Add Due Record", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                        Text("Record a new customer pending payment", style: TextStyle(fontSize: 12, color: Colors.grey)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),
              
              Form(
                key: _formKey,
                child: Column(
                  children: [
                    TextFormField(
                      decoration: InputDecoration(
                        labelText: "Customer Name",
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        prefixIcon: const Icon(Icons.person_outline),
                        filled: true,
                        fillColor: Colors.grey.shade50,
                      ),
                      onSaved: (val) => customer = val ?? '',
                      validator: (val) => val!.isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      decoration: InputDecoration(
                        labelText: "Amount",
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        prefixIcon: const Icon(Icons.attach_money),
                        filled: true,
                        fillColor: Colors.grey.shade50,
                        suffixText: "BDT",
                      ),
                      keyboardType: TextInputType.number,
                      onSaved: (val) => amount = val ?? '',
                      validator: (val) => val!.isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      decoration: InputDecoration(
                        labelText: "Invoice Number (Optional)",
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        prefixIcon: const Icon(Icons.description_outlined),
                        filled: true,
                        fillColor: Colors.grey.shade50,
                      ),
                      onSaved: (val) => invoice = val ?? '',
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),
              
              // Actions
              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                    ),
                    child: const Text("Cancel"),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    onPressed: () async {
                      if (_formKey.currentState!.validate()) {
                        _formKey.currentState!.save();
                        final success = await context.read<FinanceProvider>().addDueRecord({
                          'customer': customer,
                          'amount': amount,
                          'invoice': invoice,
                          'status': 'Pending',
                          'dueDate': DateTime.now().toIso8601String(),
                        });
                        if (success && context.mounted) {
                          Navigator.pop(ctx);
                        }
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.red.shade700,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                    child: const Text("Add Record"),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _showSettleDialog(BuildContext context, record, double remaining) {
    final _amountController = TextEditingController();
    String method = 'Cash';

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text("Settle Payment for ${record.customer}"),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text("Remaining Due: ৳${remaining.toStringAsFixed(2)}"),
            const SizedBox(height: 10),
            TextField(
              controller: _amountController,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: "Amount to Pay"),
            ),
            const SizedBox(height: 10),
            DropdownButtonFormField<String>(
              value: method,
              items: ['Cash', 'Bank', 'bKash', 'Nagad'].map((m) => DropdownMenuItem(value: m, child: Text(m))).toList(),
              onChanged: (val) => method = val!,
              decoration: const InputDecoration(labelText: "Payment Method"),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text("Cancel")),
          ElevatedButton(
            onPressed: () async {
              final payAmount = double.tryParse(_amountController.text) ?? 0;
              if (payAmount <= 0 || payAmount > remaining) {
                ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text("Invalid Amount")));
                return;
              }

              // Logic to update. We probably need a specific API endpoint or update logic
              // For now, assume provider has updateDueRecord which takes ID and data
              // In real app, might need a transaction ID or explicit 'settle' endpoint.
              // Based on finance.tsx: updateDueMutation calls dueRecordsApi.update with paymentAmount.
              
              final success = await context.read<FinanceProvider>().updateDueRecord(record.id, {
                'paymentAmount': payAmount.toString(),
                'paymentMethod': method,
              });

              if (success && context.mounted) {
                Navigator.pop(ctx);
              }
            },
            child: const Text("Confirm Payment"),
          ),
        ],
      ),
    );
  }
}
