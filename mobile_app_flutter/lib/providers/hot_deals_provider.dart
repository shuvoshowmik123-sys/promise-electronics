import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import '../config/api_config.dart';

class HotDealsProvider with ChangeNotifier {
  List<dynamic> _hotDeals = [];
  bool _isLoading = false;
  String? _error;

  List<dynamic> get hotDeals => _hotDeals;
  bool get isLoading => _isLoading;
  String? get error => _error;

  Future<void> fetchHotDeals() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/inventory/hot-deals'),
        headers: ApiConfig.headers,
      );

      if (response.statusCode == 200) {
        final List<dynamic> data = json.decode(response.body);
        _hotDeals = data;
      } else {
        _error = 'Failed to load hot deals: ${response.statusCode}';
      }
    } catch (e) {
      _error = 'Error fetching hot deals: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
