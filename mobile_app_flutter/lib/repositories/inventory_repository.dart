import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../services/api_client.dart';

/// Result wrapper for repository operations
class Result<T> {
  final T? data;
  final String? error;
  final bool isSuccess;

  Result.success(this.data)
      : error = null,
        isSuccess = true;

  Result.failure(this.error)
      : data = null,
        isSuccess = false;
}

/// Product model
class Product {
  final String id;
  final String name;
  final String? sku;
  final String? description;
  final double price;
  final double? costPrice;
  final int quantity;
  final String? category;
  final List<String> images;
  final String? brand;
  final String? model;
  final bool isActive;
  final bool showOnWebsite;
  final bool showOnAndroidApp;
  final bool isHotDeal;
  final double? hotDealPrice;
  final bool isSparePart;

  Product({
    required this.id,
    required this.name,
    this.sku,
    this.description,
    required this.price,
    this.costPrice,
    this.quantity = 0,
    this.category,
    this.images = const [],
    this.brand,
    this.model,
    this.isActive = true,
    this.showOnWebsite = false,
    this.showOnAndroidApp = true,
    this.isHotDeal = false,
    this.hotDealPrice,
    this.isSparePart = false,
  });

  factory Product.fromJson(Map<String, dynamic> json) {
    List<String> parseImages(dynamic imagesData) {
      if (imagesData == null) return [];
      if (imagesData is List) {
        return imagesData.map((e) => e.toString()).toList();
      }
      if (imagesData is String && imagesData.isNotEmpty) {
        try {
          // Try to parse as JSON array
          final decoded = jsonDecode(imagesData);
          if (decoded is List) {
            return decoded.map((e) => e.toString()).toList();
          }
          return [imagesData];
        } catch (e) {
          // If not valid JSON, treat as single URL
          return [imagesData];
        }
      }
      return [];
    }

    // Parse hot deal price
    double? parseHotDealPrice(dynamic value) {
      if (value == null) return null;
      if (value is num) return value.toDouble();
      if (value is String && value.isNotEmpty) {
        return double.tryParse(value);
      }
      return null;
    }

    return Product(
      id: json['id']?.toString() ?? '',
      name: json['name']?.toString() ?? 'Unknown Product',
      sku: json['sku']?.toString(),
      description: json['description']?.toString(),
      price: (json['price'] is num
              ? json['price'].toDouble()
              : double.tryParse(json['price']?.toString() ?? '0')) ??
          0,
      costPrice: json['costPrice'] != null
          ? (json['costPrice'] is num
              ? json['costPrice'].toDouble()
              : double.tryParse(json['costPrice']?.toString() ?? '0'))
          : null,
      quantity: (json['stock'] ?? json['quantity']) is int
          ? (json['stock'] ?? json['quantity'])
          : int.tryParse(
                  (json['stock'] ?? json['quantity'])?.toString() ?? '0') ??
              0,
      category: json['category']?.toString(),
      images: parseImages(json['images']),
      brand: json['brand']?.toString(),
      model: json['model']?.toString(),
      isActive: json['isActive'] == true || json['isActive'] == 'true',
      showOnWebsite:
          json['showOnWebsite'] == true || json['showOnWebsite'] == 'true',
      showOnAndroidApp: json['showOnAndroidApp'] == true ||
          json['showOnAndroidApp'] == 'true' ||
          json['showOnAndroidApp'] == null,
      isHotDeal:
          json['showOnHotDeals'] == true || json['showOnHotDeals'] == 'true',
      hotDealPrice: parseHotDealPrice(json['hotDealPrice']),
      isSparePart: json['isSparePart'] == true || json['isSparePart'] == 'true',
    );
  }

  /// Get first image URL or null
  String? get primaryImage => images.isNotEmpty ? images.first : null;

  /// Get the effective price (hot deal price if available, otherwise regular price)
  double get effectivePrice =>
      (isHotDeal && hotDealPrice != null) ? hotDealPrice! : price;

  /// Format price with BDT currency
  String get formattedPrice => '৳${price.toStringAsFixed(0)}';

  /// Format effective price with BDT currency
  String get formattedEffectivePrice => '৳${effectivePrice.toStringAsFixed(0)}';

  /// Check if product has a discount
  bool get hasDiscount =>
      isHotDeal && hotDealPrice != null && hotDealPrice! < price;

  /// Get discount percentage
  int get discountPercent {
    if (!hasDiscount) return 0;
    return (((price - hotDealPrice!) / price) * 100).round();
  }
}

/// Inventory Repository
/// Handles product/inventory operations
class InventoryRepository {
  final ApiClient _client = ApiClient();

  /// Get all products visible on Android app
  /// Backend: GET /api/mobile/inventory
  Future<Result<List<Product>>> getMobileProducts() async {
    try {
      final response = await _client.get('/api/mobile/inventory');

      if (response.statusCode == 200 && response.data != null) {
        final List<dynamic> data = response.data is List ? response.data : [];
        final products = data.map((json) => Product.fromJson(json)).toList();
        return Result.success(products);
      }

      return Result.failure('Failed to fetch products.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Get mobile products error: $e');
      return Result.failure('Failed to load products.');
    }
  }

  /// Get all products (website inventory)
  /// Backend: GET /api/products
  Future<Result<List<Product>>> getAllProducts() async {
    try {
      final response = await _client.get('/api/products');

      if (response.statusCode == 200 && response.data != null) {
        final List<dynamic> data = response.data is List ? response.data : [];
        final products = data.map((json) => Product.fromJson(json)).toList();
        return Result.success(products);
      }

      return Result.failure('Failed to fetch products.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Get all products error: $e');
      return Result.failure('Failed to load products.');
    }
  }

  /// Get single product by ID
  /// Backend: GET /api/products/:id
  Future<Result<Product>> getProduct(String id) async {
    try {
      final response = await _client.get('/api/products/$id');

      if (response.statusCode == 200 && response.data != null) {
        final product = Product.fromJson(response.data as Map<String, dynamic>);
        return Result.success(product);
      }

      return Result.failure('Product not found.');
    } on DioException catch (e) {
      return _handleDioError(e);
    } catch (e) {
      debugPrint('Get product error: $e');
      return Result.failure('Failed to load product.');
    }
  }

  /// Search products by query
  Future<Result<List<Product>>> searchProducts(String query) async {
    try {
      final result = await getMobileProducts();
      if (!result.isSuccess || result.data == null) {
        return result;
      }

      final searchLower = query.toLowerCase();
      final filtered = result.data!.where((product) {
        return product.name.toLowerCase().contains(searchLower) ||
            (product.description?.toLowerCase().contains(searchLower) ??
                false) ||
            (product.brand?.toLowerCase().contains(searchLower) ?? false) ||
            (product.category?.toLowerCase().contains(searchLower) ?? false);
      }).toList();

      return Result.success(filtered);
    } catch (e) {
      debugPrint('Search products error: $e');
      return Result.failure('Search failed.');
    }
  }

  /// Filter products by category
  Future<Result<List<Product>>> getProductsByCategory(String category) async {
    try {
      final result = await getMobileProducts();
      if (!result.isSuccess || result.data == null) {
        return result;
      }

      final filtered = result.data!.where((product) {
        return product.category?.toLowerCase() == category.toLowerCase();
      }).toList();

      return Result.success(filtered);
    } catch (e) {
      debugPrint('Get products by category error: $e');
      return Result.failure('Failed to filter products.');
    }
  }

  /// Handle Dio errors
  Result<T> _handleDioError<T>(DioException e) {
    if (e.response != null) {
      final data = e.response?.data;
      if (data is Map<String, dynamic>) {
        final message = data['message'] ?? data['error'];
        if (message != null) {
          return Result.failure(message.toString());
        }
      }
    }

    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return Result.failure('Connection timeout. Please try again.');
      case DioExceptionType.connectionError:
        return Result.failure('No internet connection.');
      default:
        return Result.failure('Something went wrong.');
    }
  }
}
