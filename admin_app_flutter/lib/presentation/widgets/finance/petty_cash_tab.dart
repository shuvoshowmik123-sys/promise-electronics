import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../../../providers/finance_provider.dart';

class PettyCashTab extends StatelessWidget {
  const PettyCashTab({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<FinanceProvider>(
      builder: (context, provider, child) {
        if (provider.isLoadingPettyCash) {
          return const Center(child: CircularProgressIndicator());
        }

        final stats = provider.stats;

        return RefreshIndicator(
          onRefresh: () => provider.fetchPettyCash(),
          child: Scaffold( // To use FloatingActionButton
            backgroundColor: Colors.transparent,
            body: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // Stats Row
                Row(
                  children: [
                    Expanded(child: _buildStatCard("Cash In Hand", stats.cashInHand, Colors.black)),
                    const SizedBox(width: 8),
                    Expanded(child: _buildStatCard("Today's Income", stats.todayIncome, Colors.green)),
                    const SizedBox(width: 8),
                    Expanded(child: _buildStatCard("Today's Expense", stats.todayExpense, Colors.red)),
                  ],
                ),
                const SizedBox(height: 20),

                const Text("Transactions", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                const SizedBox(height: 10),

                if (provider.pettyCashRecords.isEmpty)
                   const Padding(padding: EdgeInsets.all(20), child: Center(child: Text("No transactions recorded"))),

                ...provider.pettyCashRecords.map((record) => Card(
                  elevation: 1,
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: _getTypeColor(record.type).withOpacity(0.1),
                      child: Icon(
                        _getTypeIcon(record.type), 
                        color: _getTypeColor(record.type),
                        size: 20
                      ),
                    ),
                    title: Text(record.description.isNotEmpty ? record.description : record.category),
                    subtitle: Text("${record.category} • ${DateFormat('MMM dd').format(record.createdAt ?? DateTime.now())}"),
                    trailing: Text(
                      "${_isIncome(record.type) ? '+' : '-'}৳${record.amount}",
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 16,
                        color: _isIncome(record.type) ? Colors.green : Colors.red,
                      ),
                    ),
                  ),
                )).toList(),
              ],
            ),
            floatingActionButton: FloatingActionButton.extended(
              onPressed: () => _showAddTransactionDialog(context),
              label: const Text("Add Transaction"),
              icon: const Icon(Icons.add),
            ),
          ),
        );
      },
    );
  }

  bool _isIncome(String type) => ['Income', 'Cash', 'Bank', 'bKash', 'Nagad'].contains(type);

  Color _getTypeColor(String type) => _isIncome(type) ? Colors.green : Colors.red;

  IconData _getTypeIcon(String type) => _isIncome(type) ? Icons.arrow_downward : Icons.arrow_upward;

  Widget _buildStatCard(String title, double amount, Color color) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(8), border: Border.all(color: Colors.grey.shade200)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 11, color: Colors.grey), maxLines: 1, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text("৳${amount.toStringAsFixed(0)}", style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: color)),
        ],
      ),
    );
  }

  void _showAddTransactionDialog(BuildContext context) {
    final _formKey = GlobalKey<FormState>();
    String type = 'Expense';
    final _descriptionController = TextEditingController();
    final _categoryController = TextEditingController();
    final _amountController = TextEditingController();

    final List<String> _suggestedCategories = [
      "Food",
      "Transport",
      "Office Supplies",
      "Repair",
      "Utility",
      "Internet",
      "Salary"
    ];

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
                      color: Colors.indigo.shade50,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(Icons.account_balance_wallet_rounded, color: Colors.indigo.shade700, size: 28),
                  ),
                  const SizedBox(width: 16),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text("Add Transaction", style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                        Text("Record new income or expense", style: TextStyle(fontSize: 12, color: Colors.grey)),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 24),

              Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    DropdownButtonFormField<String>(
                      value: type,
                      decoration: InputDecoration(
                        labelText: "Type",
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                        filled: true,
                        fillColor: Colors.grey.shade50,
                      ),
                      items: const [
                        DropdownMenuItem(value: "Expense", child: Text("Expense", style: TextStyle(color: Colors.red))),
                        DropdownMenuItem(value: "Income", child: Text("Income", style: TextStyle(color: Colors.green))),
                      ],
                      onChanged: (val) => type = val!,
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _descriptionController,
                      decoration: InputDecoration(
                        labelText: "Description",
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        prefixIcon: const Icon(Icons.description_outlined),
                        filled: true,
                        fillColor: Colors.grey.shade50,
                      ),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _categoryController,
                      decoration: InputDecoration(
                        labelText: "Category",
                        hintText: "e.g., Food, Transport, Repair",
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        prefixIcon: const Icon(Icons.label_outline),
                        filled: true,
                        fillColor: Colors.grey.shade50,
                      ),
                      validator: (val) => val!.isEmpty ? 'Required' : null,
                    ),
                    const SizedBox(height: 8),
                    Wrap(
                      spacing: 8,
                      runSpacing: 4,
                      children: _suggestedCategories.map((cat) {
                        return ActionChip(
                          label: Text(cat, style: const TextStyle(fontSize: 11)),
                          padding: EdgeInsets.zero,
                          visualDensity: VisualDensity.compact,
                          onPressed: () {
                            _categoryController.text = cat;
                          },
                          backgroundColor: Colors.indigo.shade50,
                          side: BorderSide.none,
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                        );
                      }).toList(),
                    ),
                    const SizedBox(height: 16),
                    TextFormField(
                      controller: _amountController,
                      decoration: InputDecoration(
                        labelText: "Amount",
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                        prefixIcon: const Icon(Icons.attach_money),
                        filled: true,
                        fillColor: Colors.grey.shade50,
                        suffixText: "BDT",
                      ),
                      keyboardType: TextInputType.number,
                      validator: (val) => val!.isEmpty ? 'Required' : null,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 32),

              Row(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  TextButton(
                    onPressed: () => Navigator.pop(ctx),
                    style: TextButton.styleFrom(padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12)),
                    child: const Text("Cancel"),
                  ),
                  const SizedBox(width: 12),
                  ElevatedButton(
                    onPressed: () async {
                      if (_formKey.currentState!.validate()) {
                        final success = await context.read<FinanceProvider>().addPettyCash({
                          'type': type,
                          'description': _descriptionController.text,
                          'category': _categoryController.text,
                          'amount': _amountController.text,
                        });
                        if (success && context.mounted) {
                          Navigator.pop(ctx);
                        }
                      }
                    },
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.indigo.shade700,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      elevation: 0,
                    ),
                    child: const Text("Add"),
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
