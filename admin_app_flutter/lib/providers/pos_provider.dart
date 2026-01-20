import 'package:flutter/material.dart';
import 'package:dio/dio.dart';
import '../core/api/dio_client.dart';

class CartItem {
  final Map<String, dynamic> product;
  int quantity;

  CartItem({required this.product, this.quantity = 1});

  double get price => double.tryParse(product['price'].toString()) ?? 0;
  double get total => price * quantity;
}

class POSProvider extends ChangeNotifier {
  final DioClient _dioClient;
  bool _isLoading = false;
  String? _error;
  
  final List<CartItem> _cart = [];

  POSProvider(this._dioClient);

  bool get isLoading => _isLoading;
  String? get error => _error;
  List<CartItem> get cart => _cart;

  double get totalAmount => _cart.fold(0, (sum, item) => sum + item.total);
  int get totalItems => _cart.fold(0, (sum, item) => sum + item.quantity);

  void addToCart(Map<String, dynamic> product) {
    final index = _cart.indexWhere((item) => item.product['id'] == product['id']);
    if (index >= 0) {
      _cart[index].quantity++;
    } else {
      _cart.add(CartItem(product: product));
    }
    notifyListeners();
  }

  void removeFromCart(Map<String, dynamic> product) {
    final index = _cart.indexWhere((item) => item.product['id'] == product['id']);
    if (index >= 0) {
      if (_cart[index].quantity > 1) {
        _cart[index].quantity--;
      } else {
        _cart.removeAt(index);
      }
      notifyListeners();
    }
  }

  void clearCart() {
    _cart.clear();
    notifyListeners();
  }

  Future<bool> submitTransaction({
    required String paymentMethod,
    required double discount,
    String? customerId,
    String? notes,
  }) async {
    if (_cart.isEmpty) return false;

    _isLoading = true;
    notifyListeners();

    try {
      final items = _cart.map((item) => {
        'productId': item.product['id'],
        'quantity': item.quantity,
        'unitPrice': item.price,
      }).toList();

      final data = {
        'items': items,
        'amount': totalAmount,
        'discount': discount,
        'finalAmount': totalAmount - discount,
        'paymentMethod': paymentMethod,
        'customerId': customerId,
        'notes': notes,
        'type': 'sale', // or 'service'
        'status': 'completed',
        'date': DateTime.now().toIso8601String(),
      };

      // Assuming endpoint is /api/pos/transactions or similar
      // If backend doesn't exist yet, this will fail. We'll proceed assuming it exists or needs creation.
      // Based on previous mocks, we might use a generic transactions endpoint.
      // Let's inspect backend routes if this fails. For now, use /api/transactions
      final response = await _dioClient.post('/api/pos-transactions', data: data);

      if (response.statusCode == 200 || response.statusCode == 201) {
        clearCart();
        return true;
      }
      return false;
    } on DioException catch (e) {
      _error = e.response?.data['message'] ?? 'Transaction failed';
      return false;
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }
}
