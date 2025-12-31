import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import '../models/warranty.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../config/app_theme.dart';

class MyWarrantiesScreen extends StatefulWidget {
  const MyWarrantiesScreen({super.key});

  @override
  State<MyWarrantiesScreen> createState() => _MyWarrantiesScreenState();
}

class _MyWarrantiesScreenState extends State<MyWarrantiesScreen> {
  late Future<List<Warranty>> _warrantiesFuture;

  @override
  void initState() {
    super.initState();
    _warrantiesFuture = context.read<AuthProvider>().getWarranties();
  }

  Future<void> _refresh() async {
    setState(() {
      _warrantiesFuture = context.read<AuthProvider>().getWarranties();
    });
    await _warrantiesFuture;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isBangla = Provider.of<LocaleProvider>(context).isBangla;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      appBar: AppBar(
        title: Text(
          isBangla ? 'আমার ওয়ারেন্টি' : 'My Warranties',
          style: TextStyle(
            color: isDark ? Colors.white : Colors.black,
            fontWeight: FontWeight.bold,
          ),
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back,
              color: isDark ? Colors.white : Colors.black),
          onPressed: () => Navigator.pop(context),
        ),
        centerTitle: true,
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Warranty>>(
          future: _warrantiesFuture,
          builder: (context, snapshot) {
            if (snapshot.connectionState == ConnectionState.waiting) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snapshot.hasError) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    const Icon(Icons.error_outline,
                        size: 48, color: Colors.red),
                    const SizedBox(height: 16),
                    Text(
                      isBangla
                          ? 'তথ্য লোড করতে সমস্যা হয়েছে'
                          : 'Failed to load warranties',
                      style: TextStyle(
                        color: isDark ? Colors.white : Colors.black,
                      ),
                    ),
                    TextButton(
                      onPressed: _refresh,
                      child: Text(isBangla ? 'আবার চেষ্টা করুন' : 'Try Again'),
                    ),
                  ],
                ),
              );
            }

            final warranties = snapshot.data ?? [];

            if (warranties.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(
                      Icons.verified_user_outlined,
                      size: 64,
                      color: isDark ? Colors.grey[700] : Colors.grey[300],
                    ),
                    const SizedBox(height: 16),
                    Text(
                      isBangla ? 'কোন ওয়ারেন্টি নেই' : 'No Warranties Found',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                        color: isDark ? Colors.grey[400] : Colors.grey[600],
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      isBangla
                          ? 'আপনার সম্পন্ন করা মেরামতের ওয়ারেন্টি এখানে দেখা যাবে'
                          : 'Warranties will appear here after repairs',
                      style: TextStyle(
                        color: isDark ? Colors.grey[600] : Colors.grey[500],
                      ),
                    ),
                  ],
                ),
              );
            }

            return ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: warranties.length,
              itemBuilder: (context, index) {
                return _buildWarrantyCard(warranties[index], isDark, isBangla);
              },
            );
          },
        ),
      ),
    );
  }

  Widget _buildWarrantyCard(Warranty warranty, bool isDark, bool isBangla) {
    final hasServiceWarranty = warranty.serviceWarranty.days > 0;
    final hasPartsWarranty = warranty.partsWarranty.days > 0;

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : Colors.white,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
        border: Border.all(
          color: isDark ? Colors.grey[800]! : Colors.grey[100]!,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color: Colors.blue.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.shield, color: Colors.blue),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        warranty.device,
                        style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.white : Colors.black,
                        ),
                      ),
                      Text(
                        'Job ID: ${warranty.jobId}',
                        style: TextStyle(
                          fontSize: 12,
                          color: isDark ? Colors.grey[400] : Colors.grey[600],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Divider(
              height: 1, color: isDark ? Colors.grey[800] : Colors.grey[100]),

          // Issue & Date
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  warranty.issue,
                  style: TextStyle(
                    fontSize: 14,
                    color: isDark ? Colors.grey[300] : Colors.grey[800],
                  ),
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    Icon(Icons.calendar_today,
                        size: 12,
                        color: isDark ? Colors.grey[500] : Colors.grey[500]),
                    const SizedBox(width: 4),
                    Text(
                      'Completed: ${DateFormat('dd MMM yyyy').format(DateTime.parse(warranty.completedAt))}',
                      style: TextStyle(
                        fontSize: 12,
                        color: isDark ? Colors.grey[500] : Colors.grey[500],
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),

          // Warranty Details
          if (hasServiceWarranty || hasPartsWarranty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              child: Row(
                children: [
                  if (hasServiceWarranty)
                    Expanded(
                      child: _buildWarrantyStatus(
                        context,
                        isDark,
                        isBangla,
                        'Service',
                        warranty.serviceWarranty,
                      ),
                    ),
                  if (hasServiceWarranty && hasPartsWarranty)
                    const SizedBox(width: 12),
                  if (hasPartsWarranty)
                    Expanded(
                      child: _buildWarrantyStatus(
                        context,
                        isDark,
                        isBangla,
                        'Parts',
                        warranty.partsWarranty,
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildWarrantyStatus(
    BuildContext context,
    bool isDark,
    bool isBangla,
    String type,
    WarrantyDetails details,
  ) {
    final isActive = details.isActive;
    final color = isActive ? Colors.green : Colors.red;
    final bgColor = isActive
        ? (isDark ? Colors.green.withValues(alpha: 0.1) : Colors.green[50])
        : (isDark ? Colors.red.withValues(alpha: 0.1) : Colors.red[50]);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isActive
              ? (isDark
                  ? Colors.green.withValues(alpha: 0.3)
                  : Colors.green[100]!)
              : (isDark ? Colors.red.withValues(alpha: 0.3) : Colors.red[100]!),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(
                isActive ? Icons.check_circle : Icons.cancel,
                size: 16,
                color: color,
              ),
              const SizedBox(width: 4),
              Text(
                type,
                style: TextStyle(
                  fontWeight: FontWeight.bold,
                  fontSize: 12,
                  color: isDark ? Colors.white : Colors.black87,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Text(
              isActive ? 'Active' : 'Expired',
              style: const TextStyle(
                color: Colors.white,
                fontSize: 10,
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
          const SizedBox(height: 4),
          Text(
            '${details.days} days',
            style: TextStyle(
              fontSize: 11,
              color: isDark ? Colors.grey[400] : Colors.grey[600],
            ),
          ),
          if (isActive)
            Text(
              '${details.remainingDays} days left',
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
        ],
      ),
    );
  }
}
