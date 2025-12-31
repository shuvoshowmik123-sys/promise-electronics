// Cart Provider for managing shopping cart state
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../repositories/inventory_repository.dart';

class CartItem {
  final Product product;
  final bool isFromHotDeal;
  final double appliedPrice;
  int quantity;

  CartItem({
    required this.product,
    this.quantity = 1,
    this.isFromHotDeal = false,
    double? appliedPrice,
  }) : appliedPrice = appliedPrice ?? product.price;

  double get totalPrice => appliedPrice * quantity;

  /// Check if this item has a discount applied
  bool get hasDiscount => isFromHotDeal && appliedPrice < product.price;

  /// Get the savings per item
  double get savings => hasDiscount ? product.price - appliedPrice : 0;

  /// Get total savings for this cart item
  double get totalSavings => savings * quantity;

  Map<String, dynamic> toJson() {
    return {
      'productId': product.id,
      'quantity': quantity,
      'productName': product.name,
      'price': appliedPrice, // Send the applied price (hot deal or regular)
      'originalPrice': product.price,
      'isFromHotDeal': isFromHotDeal,
      'image': product.primaryImage,
    };
  }
}

class CartProvider extends ChangeNotifier {
  final Map<String, CartItem> _items = {};
  // Note: _cartKey is reserved for future persistent cart implementation
  // static const String _cartKey = 'cart_items';

  Map<String, CartItem> get items => {..._items};

  int get itemCount => _items.length;

  double get totalAmount {
    var total = 0.0;
    _items.forEach((key, cartItem) {
      total += cartItem.appliedPrice * cartItem.quantity;
    });
    return total;
  }

  /// Get total savings from hot deals
  double get totalSavings {
    var savings = 0.0;
    _items.forEach((key, cartItem) {
      savings += cartItem.totalSavings;
    });
    return savings;
  }

  CartProvider() {
    _loadCart();
  }

  /// Add item with regular price (from shop)
  void addItem(Product product) {
    _addItemInternal(product,
        isFromHotDeal: false, appliedPrice: product.price);
  }

  /// Add item with hot deal price (from hot deals section)
  void addItemFromHotDeal(Product product) {
    final hotDealPrice = product.hotDealPrice ?? product.price;
    _addItemInternal(product, isFromHotDeal: true, appliedPrice: hotDealPrice);
  }

  void _addItemInternal(Product product,
      {required bool isFromHotDeal, required double appliedPrice}) {
    // Use a unique key that includes whether it's a hot deal
    // This allows same product to be in cart with different prices
    final cartKey = isFromHotDeal ? '${product.id}_hotdeal' : product.id;

    if (_items.containsKey(cartKey)) {
      _items.update(
        cartKey,
        (existingCartItem) => CartItem(
          product: existingCartItem.product,
          quantity: existingCartItem.quantity + 1,
          isFromHotDeal: existingCartItem.isFromHotDeal,
          appliedPrice: existingCartItem.appliedPrice,
        ),
      );
    } else {
      _items.putIfAbsent(
        cartKey,
        () => CartItem(
          product: product,
          isFromHotDeal: isFromHotDeal,
          appliedPrice: appliedPrice,
        ),
      );
    }
    _saveCart();
    notifyListeners();
  }

  void removeSingleItem(String cartKey) {
    if (!_items.containsKey(cartKey)) {
      return;
    }
    if (_items[cartKey]!.quantity > 1) {
      _items.update(
        cartKey,
        (existingCartItem) => CartItem(
          product: existingCartItem.product,
          quantity: existingCartItem.quantity - 1,
          isFromHotDeal: existingCartItem.isFromHotDeal,
          appliedPrice: existingCartItem.appliedPrice,
        ),
      );
    } else {
      _items.remove(cartKey);
    }
    _saveCart();
    notifyListeners();
  }

  void removeItem(String cartKey) {
    _items.remove(cartKey);
    _saveCart();
    notifyListeners();
  }

  void clear() {
    _items.clear();
    _saveCart();
    notifyListeners();
  }

  Future<void> _saveCart() async {
    // ignore: unused_local_variable
    final _ = await SharedPreferences.getInstance();
    // Simple persistence - in a real app, you might want to sync with backend
    // For now, we just persist IDs and quantities, but since we need Product objects,
    // we'll rely on memory for full objects and maybe just persist a simple list
    // or rely on the user session if backend supported it.
    // Given the current scope, we will skip complex persistence of full Product objects
    // to avoid serialization issues, or implement a basic one.

    // For this implementation, we'll keep it in memory for the session.
    // If persistence is critical, we'd serialize the essential product data.
  }

  Future<void> _loadCart() async {
    // Load logic would go here
  }
}
