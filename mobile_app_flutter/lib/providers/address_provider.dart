import 'package:flutter/foundation.dart';
import '../services/api_client.dart';

/// Model class for Address
class Address {
  final String id;
  final String label;
  final String address;
  final bool isDefault;
  final DateTime? createdAt;

  Address({
    required this.id,
    required this.label,
    required this.address,
    required this.isDefault,
    this.createdAt,
  });

  factory Address.fromJson(Map<String, dynamic> json) {
    return Address(
      id: json['id'] ?? '',
      label: json['label'] ?? '',
      address: json['address'] ?? '',
      isDefault: json['isDefault'] ?? false,
      createdAt: json['createdAt'] != null
          ? DateTime.tryParse(json['createdAt'])
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'label': label,
      'address': address,
      'isDefault': isDefault,
    };
  }
}

/// Provider for managing customer addresses
class AddressProvider extends ChangeNotifier {
  final ApiClient _apiClient = ApiClient();

  List<Address> _addresses = [];
  bool _isLoading = false;
  String? _error;

  List<Address> get addresses => _addresses;
  bool get isLoading => _isLoading;
  String? get error => _error;

  /// Get the default address if any
  Address? get defaultAddress {
    try {
      return _addresses.firstWhere((a) => a.isDefault);
    } catch (_) {
      return _addresses.isNotEmpty ? _addresses.first : null;
    }
  }

  /// Fetch all addresses from the backend
  Future<void> fetchAddresses() async {
    _isLoading = true;
    _error = null;
    notifyListeners();

    try {
      final response = await _apiClient.get('/api/customer/addresses');
      if (response.data != null && response.data is List) {
        _addresses = (response.data as List)
            .map((json) => Address.fromJson(json as Map<String, dynamic>))
            .toList();
      } else {
        _addresses = [];
      }
    } catch (e) {
      _error = e.toString();
      debugPrint('Error fetching addresses: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  /// Create a new address
  Future<bool> createAddress({
    required String label,
    required String address,
    bool isDefault = false,
  }) async {
    try {
      await _apiClient.post('/api/customer/addresses', data: {
        'label': label,
        'address': address,
        'isDefault': isDefault,
      });

      await fetchAddresses(); // Refresh list
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// Update an existing address
  Future<bool> updateAddress({
    required String id,
    String? label,
    String? address,
    bool? isDefault,
  }) async {
    try {
      final data = <String, dynamic>{};
      if (label != null) data['label'] = label;
      if (address != null) data['address'] = address;
      if (isDefault != null) data['isDefault'] = isDefault;

      await _apiClient.patch('/api/customer/addresses/$id', data: data);

      await fetchAddresses(); // Refresh list
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// Delete an address
  Future<bool> deleteAddress(String id) async {
    try {
      await _apiClient.delete('/api/customer/addresses/$id');
      await fetchAddresses(); // Refresh list
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// Clear addresses (on logout)
  void clear() {
    _addresses = [];
    _error = null;
    notifyListeners();
  }
}
