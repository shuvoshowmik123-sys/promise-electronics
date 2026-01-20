import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../../providers/finance_provider.dart';

class SalesTab extends StatelessWidget {
  const SalesTab({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<FinanceProvider>(
      builder: (context, provider, child) {
        if (provider.isLoadingSales) {
          return const Center(child: CircularProgressIndicator());
        }

        final stats = provider.stats;

        return RefreshIndicator(
          onRefresh: () => provider.fetchSales(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // Stats Grid
              GridView.count(
                crossAxisCount: 2,
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 1.5,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _buildStatCard("Total Sales", stats.totalSales, Colors.black),
                  _buildStatCard("Cash Sales", stats.cashSales, Colors.green),
                  _buildStatCard("Bank Sales", stats.bankSales, Colors.blue),
                  _buildStatCard("bKash Sales", stats.bkashSales, Colors.pink),
                  _buildStatCard("Nagad Sales", stats.nagadSales, Colors.orange),
                  _buildStatCard("Due Sales", stats.dueSales, Colors.red),
                ],
              ),
              const SizedBox(height: 20),
              
              const Text("Transaction History", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),

              if (provider.sales.isEmpty)
                 const Padding(padding: EdgeInsets.all(20), child: Center(child: Text("No sales recorded"))),

              ...provider.sales.map((sale) => Card(
                elevation: 1,
                margin: const EdgeInsets.only(bottom: 8),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                child: ListTile(
                  title: Text(sale.invoiceNumber ?? 'Invoice #${sale.id}'),
                  subtitle: Text("${sale.customer ?? 'Walk-in'} • ${sale.paymentMethod}"),
                  trailing: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text("৳${sale.total}", style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      Text(sale.paymentStatus, style: TextStyle(
                        color: sale.paymentStatus == 'Paid' ? Colors.green : Colors.red,
                        fontSize: 12
                      )),
                    ],
                  ),
                ),
              )).toList(),
            ],
          ),
        );
      },
    );
  }

  Widget _buildStatCard(String title, double amount, Color color) {
    return Card(
      elevation: 2,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(title, style: const TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 4),
            Text("৳${amount.toStringAsFixed(0)}", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: color)),
          ],
        ),
      ),
    );
  }
}
