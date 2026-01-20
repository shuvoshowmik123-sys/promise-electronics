class PettyCashRecord {
  final int id;
  final String description;
  final String category;
  final String amount;
  final String type; // 'Income' or 'Expense'
  final DateTime? createdAt;

  PettyCashRecord({
    required this.id,
    required this.description,
    required this.category,
    required this.amount,
    required this.type,
    this.createdAt,
  });

  factory PettyCashRecord.fromJson(Map<String, dynamic> json) {
    return PettyCashRecord(
      id: json['id'] is int ? json['id'] : int.tryParse(json['id'].toString()) ?? 0,
      description: json['description'] ?? '',
      category: json['category'] ?? '',
      amount: json['amount']?.toString() ?? '0',
      type: json['type'] ?? 'Expense',
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
    );
  }
}

class DueRecord {
  final int id;
  final String customer;
  final String amount;
  final String? paidAmount;
  final String status; // 'Pending', 'Paid'
  final String? invoice;
  final DateTime? dueDate;
  final DateTime? createdAt;

  DueRecord({
    required this.id,
    required this.customer,
    required this.amount,
    this.paidAmount,
    required this.status,
    this.invoice,
    this.dueDate,
    this.createdAt,
  });

  factory DueRecord.fromJson(Map<String, dynamic> json) {
    return DueRecord(
      id: json['id'] is int ? json['id'] : int.tryParse(json['id'].toString()) ?? 0,
      customer: json['customer'] ?? 'Unknown',
      amount: json['amount']?.toString() ?? '0',
      paidAmount: json['paidAmount']?.toString(),
      status: json['status'] ?? 'Pending',
      invoice: json['invoice'],
      dueDate: json['dueDate'] != null ? DateTime.tryParse(json['dueDate'].toString()) : null,
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
    );
  }
}

class PosTransaction {
  final int id;
  final String? invoiceNumber;
  final String? customer;
  final String total;
  final String paymentMethod;
  final String paymentStatus;
  final DateTime? createdAt;
  // Can add items later if needed for detail view

  PosTransaction({
    required this.id,
    this.invoiceNumber,
    this.customer,
    required this.total,
    required this.paymentMethod,
    required this.paymentStatus,
    this.createdAt,
  });

  factory PosTransaction.fromJson(Map<String, dynamic> json) {
    return PosTransaction(
      id: json['id'] is int ? json['id'] : int.tryParse(json['id'].toString()) ?? 0,
      invoiceNumber: json['invoiceNumber'],
      customer: json['customer'],
      total: json['total']?.toString() ?? '0',
      paymentMethod: json['paymentMethod'] ?? 'Cash',
      paymentStatus: json['paymentStatus'] ?? 'Paid',
      createdAt: json['createdAt'] != null ? DateTime.tryParse(json['createdAt'].toString()) : null,
    );
  }
}

class FinanceStats {
  final double totalSales;
  final double cashSales;
  final double bankSales;
  final double bkashSales;
  final double nagadSales;
  final double dueSales;
  final double cashInHand;
  final double todayIncome;
  final double todayExpense;

  FinanceStats({
    required this.totalSales,
    required this.cashSales,
    required this.bankSales,
    required this.bkashSales,
    required this.nagadSales,
    required this.dueSales,
    required this.cashInHand,
    required this.todayIncome,
    required this.todayExpense,
  });
}
