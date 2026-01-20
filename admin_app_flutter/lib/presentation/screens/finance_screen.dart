import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/finance_provider.dart';
import '../widgets/finance/sales_tab.dart';
import '../widgets/finance/petty_cash_tab.dart';
import '../widgets/finance/due_records_tab.dart';

class FinanceScreen extends StatefulWidget {
  const FinanceScreen({super.key});

  @override
  State<FinanceScreen> createState() => _FinanceScreenState();
}

class _FinanceScreenState extends State<FinanceScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    // Fetch data on init
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<FinanceProvider>().refreshAll();
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Container(
          color: Colors.white,
          child: TabBar(
            controller: _tabController,
            labelColor: Theme.of(context).primaryColor,
            unselectedLabelColor: Colors.grey,
            indicatorColor: Theme.of(context).primaryColor,
            tabs: const [
               Tab(text: "Sales"),
               Tab(text: "Petty Cash"),
               Tab(text: "Due Records"),
            ],
          ),
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: const [
               SalesTab(),
               PettyCashTab(),
               DueRecordsTab(),
            ],
          ),
        ),
      ],
    );
  }
}
