import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';
import '../data/models/finance_models.dart';

class FinanceProvider extends ChangeNotifier {
  final DioClient _dioClient;
  
  bool _isLoadingSales = false;
  bool _isLoadingPettyCash = false;
  bool _isLoadingDue = false;
  String? _error;

  List<PosTransaction> _sales = [];
  List<PettyCashRecord> _pettyCashRecords = [];
  List<DueRecord> _dueRecords = [];

  FinanceProvider(this._dioClient);

  // Getters
  bool get isLoadingSales => _isLoadingSales;
  bool get isLoadingPettyCash => _isLoadingPettyCash;
  bool get isLoadingDue => _isLoadingDue;
  String? get error => _error;
  
  List<PosTransaction> get sales => _sales;
  List<PettyCashRecord> get pettyCashRecords => _pettyCashRecords;
  List<DueRecord> get dueRecords => _dueRecords;

  // Computed Stats
  FinanceStats get stats {
    // Sales Stats
    double total = 0;
    double cash = 0, bank = 0, bkash = 0, nagad = 0, due = 0;

    for (var sale in _sales) {
      double amount = double.tryParse(sale.total) ?? 0;
      total += amount;
      switch (sale.paymentMethod) {
        case 'Cash': cash += amount; break;
        case 'Bank': bank += amount; break;
        case 'bKash': bkash += amount; break;
        case 'Nagad': nagad += amount; break;
        case 'Due': due += amount; break;
      }
    }

    // Petty Cash Stats
    double cashHand = 0;
    double tIncome = 0;
    double tExpense = 0;
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    for (var record in _pettyCashRecords) {
      double amount = double.tryParse(record.amount) ?? 0;
      bool isIncome = ['Income', 'Cash', 'Bank', 'bKash', 'Nagad'].contains(record.type);
      
      if (isIncome) {
        cashHand += amount;
      } else {
        cashHand -= amount;
      }

      if (record.createdAt != null) {
        final rDate = record.createdAt!;
        if (rDate.year == today.year && rDate.month == today.month && rDate.day == today.day) {
          if (isIncome) {
            tIncome += amount;
          } else if (record.type == 'Expense') {
            tExpense += amount;
          }
        }
      }
    }

    return FinanceStats(
      totalSales: total,
      cashSales: cash,
      bankSales: bank,
      bkashSales: bkash,
      nagadSales: nagad,
      dueSales: due,
      cashInHand: cashHand,
      todayIncome: tIncome,
      todayExpense: tExpense,
    );
  }

  // Fetch Sales
  Future<void> fetchSales() async {
    _isLoadingSales = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _dioClient.get('/api/pos-transactions');
      if (response.statusCode == 200) {
        final data = response.data;
        if (data is List) {
           _sales = data.map((e) => PosTransaction.fromJson(e)).toList();
           // Sort by date (newest first)
           _sales.sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
        }
      }
    } catch (e) {
      _error = "Failed to fetch sales: $e";
      print(_error);
    } finally {
      _isLoadingSales = false;
      notifyListeners();
    }
  }

  // Fetch Petty Cash
  Future<void> fetchPettyCash() async {
    _isLoadingPettyCash = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _dioClient.get('/api/petty-cash');
      if (response.statusCode == 200) {
        final data = response.data;
        if (data is List) {
           _pettyCashRecords = data.map((e) => PettyCashRecord.fromJson(e)).toList();
           _pettyCashRecords.sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
        }
      }
    } catch (e) {
      _error = "Failed to fetch petty cash: $e";
      print(_error);
    } finally {
      _isLoadingPettyCash = false;
      notifyListeners();
    }
  }

  // Add Petty Cash
  Future<bool> addPettyCash(Map<String, dynamic> data) async {
    try {
      final response = await _dioClient.post('/api/petty-cash', data: data);
      if (response.statusCode == 200 || response.statusCode == 201) {
        await fetchPettyCash();
        return true;
      }
      return false;
    } catch (e) {
      _error = "Failed to add transaction: $e";
      notifyListeners();
      return false;
    }
  }

  // Fetch Due Records
  Future<void> fetchDueRecords() async {
    _isLoadingDue = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _dioClient.get('/api/due-records');
      if (response.statusCode == 200) {
        final data = response.data;
        if (data is List) {
           _dueRecords = data.map((e) => DueRecord.fromJson(e)).toList();
           _dueRecords.sort((a, b) => (b.createdAt ?? DateTime(0)).compareTo(a.createdAt ?? DateTime(0)));
        }
      }
    } catch (e) {
      _error = "Failed to fetch due records: $e";
      print(_error);
    } finally {
      _isLoadingDue = false;
      notifyListeners();
    }
  }

  // Add Due Record
  Future<bool> addDueRecord(Map<String, dynamic> data) async {
    try {
      final response = await _dioClient.post('/api/due-records', data: data);
      if (response.statusCode == 200 || response.statusCode == 201) {
        await fetchDueRecords();
        return true;
      }
      return false;
    } catch (e) {
      _error = "Failed to add due record: $e";
      notifyListeners();
      return false;
    }
  }

  // Update Due Record (Settle Payment)
  Future<bool> updateDueRecord(int id, Map<String, dynamic> data) async {
    try {
      final response = await _dioClient.patch('/api/due-records/$id', data: data);
      if (response.statusCode == 200) {
        await fetchDueRecords();
        await fetchPettyCash(); // Payment might affect petty cash or sales
        await fetchSales();
        return true;
      }
      return false;
    } catch (e) {
      _error = "Failed to update record: $e";
      notifyListeners();
      return false;
    }
  }

  Future<void> refreshAll() async {
    await Future.wait([
      fetchSales(),
      fetchPettyCash(),
      fetchDueRecords(),
    ]);
  }
}
