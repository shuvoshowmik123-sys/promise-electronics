import 'dart:convert';
import 'dart:io';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../providers/cart_provider.dart';

import '../../repositories/order_repository.dart';

class SparePartsCheckoutScreen extends StatefulWidget {
  final List<CartItem> items;

  const SparePartsCheckoutScreen({super.key, required this.items});

  @override
  State<SparePartsCheckoutScreen> createState() =>
      _SparePartsCheckoutScreenState();
}

class _SparePartsCheckoutScreenState extends State<SparePartsCheckoutScreen> {
  final PageController _pageController = PageController();
  final OrderRepository _orderRepository = OrderRepository();
  int _currentStep = 0;
  final int _totalSteps = 5;
  bool _isSubmitting = false;

  // Step 1: Device Info
  String? _selectedBrand;
  String? _selectedSize;
  final TextEditingController _modelController = TextEditingController();

  // Step 2: Issue & Images
  String? _primaryIssue;
  final TextEditingController _descriptionController = TextEditingController();
  final List<XFile> _selectedImages = [];
  final List<String> _uploadedImageUrls = [];

  // Step 3: Fulfillment
  String _fulfillmentType = 'pickup'; // 'pickup' or 'shop'
  String _pickupTier = 'Regular'; // 'Regular', 'Priority', 'Emergency'
  DateTime? _scheduledDate;

  // Step 4: Contact
  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _addressController = TextEditingController();

  @override
  void initState() {
    super.initState();
    _prefillUserData();
  }

  void _prefillUserData() {
    final user = context.read<AuthProvider>().user;
    if (user != null) {
      _nameController.text = user.name ?? '';
      String phone = user.phone ?? '';
      if (phone.startsWith('+880')) {
        phone = phone.substring(4);
      } else if (phone.startsWith('880')) {
        phone = phone.substring(3);
      } else if (phone.startsWith('0')) {
        phone = phone.substring(1);
      }
      _phoneController.text = phone;
      _addressController.text = user.address ?? '';
    }
  }

  @override
  void dispose() {
    _pageController.dispose();
    _modelController.dispose();
    _descriptionController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  void _nextStep() {
    if (_validateStep(_currentStep)) {
      if (_currentStep < _totalSteps - 1) {
        _pageController.nextPage(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
        );
        setState(() => _currentStep++);
      } else {
        _submitOrder();
      }
    }
  }

  void _prevStep() {
    if (_currentStep > 0) {
      _pageController.previousPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );
      setState(() => _currentStep--);
    } else {
      Navigator.pop(context);
    }
  }

  bool _validateStep(int step) {
    switch (step) {
      case 0: // Device Info
        if (_selectedBrand == null) {
          _showError('Please select a brand');
          return false;
        }
        if (_selectedSize == null) {
          _showError('Please select screen size');
          return false;
        }
        return true;
      case 1: // Issue & Images
        if (_primaryIssue == null) {
          _showError('Please select primary issue');
          return false;
        }
        if (_selectedImages.isEmpty) {
          _showError('Please upload at least one image');
          return false;
        }
        return true;
      case 2: // Fulfillment
        if (_fulfillmentType == 'pickup') {
          // Tier is always selected by default
        } else {
          if (_scheduledDate == null) {
            _showError('Please select a visit date');
            return false;
          }
        }
        return true;
      case 3: // Contact
        if (_nameController.text.isEmpty) {
          _showError('Please enter your name');
          return false;
        }
        if (_phoneController.text.isEmpty) {
          _showError('Please enter your phone number');
          return false;
        }
        if (_fulfillmentType == 'pickup' && _addressController.text.isEmpty) {
          _showError('Please enter pickup address');
          return false;
        }
        return true;
      default:
        return true;
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: AppColors.coralRed,
      ),
    );
  }

  Future<void> _pickImage() async {
    final ImagePicker picker = ImagePicker();
    final List<XFile> images = await picker.pickMultiImage();
    if (images.isNotEmpty) {
      setState(() {
        _selectedImages.addAll(images);
      });
    }
  }

  Future<void> _submitOrder() async {
    setState(() => _isSubmitting = true);

    try {
      // 1. Upload Images
      _uploadedImageUrls.clear();
      for (var image in _selectedImages) {
        final bytes = await image.readAsBytes();
        final base64Image = 'data:image/jpeg;base64,${base64Encode(bytes)}';
        final url = await _orderRepository.uploadImage(base64Image);
        if (url != null) {
          _uploadedImageUrls.add(url);
        }
      }

      if (_uploadedImageUrls.isEmpty) {
        throw Exception('Failed to upload images');
      }

      // 2. Prepare Data
      final orderData = {
        'items': widget.items.map((item) => item.toJson()).toList(),
        'address': _addressController.text,
        'phone': '+880${_phoneController.text}',
        'fulfillmentType': _fulfillmentType,
        'pickupTier': _fulfillmentType == 'pickup' ? _pickupTier : null,
        'pickupAddress':
            _fulfillmentType == 'pickup' ? _addressController.text : null,
        'scheduledDate': _scheduledDate?.toIso8601String(),
        'deviceInfo': {
          'brand': _selectedBrand,
          'screenSize': _selectedSize,
          'modelNumber': _modelController.text,
          'primaryIssue': _primaryIssue,
          'description': _descriptionController.text,
          'images': _uploadedImageUrls,
        },
      };

      // 3. Submit
      final result = await _orderRepository.createSparePartOrder(orderData);

      if (result.isSuccess) {
        // Clear cart
        if (mounted) {
          // context.read<CartProvider>().clearCart(); // Implement clearCart if needed
          // Navigate to success or order details
          Navigator.of(context).popUntil((route) => route.isFirst);
          // Show success dialog
          showDialog(
            context: context,
            builder: (context) => AlertDialog(
              title: const Text('Order Submitted'),
              content: const Text(
                  'Your spare part order has been submitted for verification. We will notify you once verified.'),
              actions: [
                TextButton(
                  onPressed: () => Navigator.pop(context),
                  child: const Text('OK'),
                ),
              ],
            ),
          );
        }
      } else {
        if (mounted) _showError(result.error ?? 'Submission failed');
      }
    } catch (e) {
      if (mounted) _showError('Error: $e');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      appBar: AppBar(
        title: const Text('Spare Part Checkout'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back,
              color: isDark ? Colors.white : Colors.black),
          onPressed: _prevStep,
        ),
      ),
      body: Column(
        children: [
          // Progress Bar
          LinearProgressIndicator(
            value: (_currentStep + 1) / _totalSteps,
            backgroundColor: isDark ? AppColors.surfaceDark : Colors.grey[200],
            valueColor: const AlwaysStoppedAnimation<Color>(AppColors.primary),
          ),
          Expanded(
            child: PageView(
              controller: _pageController,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                _buildDeviceStep(isDark),
                _buildIssueStep(isDark),
                _buildFulfillmentStep(isDark),
                _buildContactStep(isDark),
                _buildSummaryStep(isDark),
              ],
            ),
          ),
          _buildBottomBar(isDark),
        ],
      ),
    );
  }

  Widget _buildDeviceStep(bool isDark) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Device Information',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : Colors.black,
            ),
          ),
          const SizedBox(height: 24),
          _buildDropdown(
            label: 'Brand',
            value: _selectedBrand,
            items: ['Samsung', 'LG', 'Sony', 'Walton', 'Vision', 'Singer'],
            onChanged: (val) => setState(() => _selectedBrand = val),
            isDark: isDark,
          ),
          const SizedBox(height: 16),
          _buildDropdown(
            label: 'Screen Size',
            value: _selectedSize,
            items: ['32"', '40"', '43"', '50"', '55"', '65"', '75"+'],
            onChanged: (val) => setState(() => _selectedSize = val),
            isDark: isDark,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _modelController,
            decoration: InputDecoration(
              labelText: 'Model Number (Optional)',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
              fillColor: isDark ? AppColors.surfaceDark : Colors.white,
            ),
            style: TextStyle(color: isDark ? Colors.white : Colors.black),
          ),
        ],
      ),
    );
  }

  Widget _buildIssueStep(bool isDark) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Issue & Images',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : Colors.black,
            ),
          ),
          const SizedBox(height: 24),
          _buildDropdown(
            label: 'Primary Issue',
            value: _primaryIssue,
            items: [
              'Broken Screen',
              'No Power',
              'No Sound',
              'Lines on Screen',
              'Dark Picture',
              'Other'
            ],
            onChanged: (val) => setState(() => _primaryIssue = val),
            isDark: isDark,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _descriptionController,
            maxLines: 3,
            decoration: InputDecoration(
              labelText: 'Description (Optional)',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
              fillColor: isDark ? AppColors.surfaceDark : Colors.white,
            ),
            style: TextStyle(color: isDark ? Colors.white : Colors.black),
          ),
          const SizedBox(height: 24),
          Text(
            'Upload Device Images',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w600,
              color: isDark ? Colors.white : Colors.black,
            ),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 12,
            runSpacing: 12,
            children: [
              ..._selectedImages.map((image) => Stack(
                    children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(8),
                        child: kIsWeb
                            ? Image.network(
                                image.path,
                                width: 100,
                                height: 100,
                                fit: BoxFit.cover,
                              )
                            : Image.file(
                                File(image.path),
                                width: 100,
                                height: 100,
                                fit: BoxFit.cover,
                              ),
                      ),
                      Positioned(
                        top: 4,
                        right: 4,
                        child: GestureDetector(
                          onTap: () {
                            setState(() {
                              _selectedImages.remove(image);
                            });
                          },
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: const BoxDecoration(
                              color: Colors.red,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.close,
                                size: 16, color: Colors.white),
                          ),
                        ),
                      ),
                    ],
                  )),
              GestureDetector(
                onTap: _pickImage,
                child: Container(
                  width: 100,
                  height: 100,
                  decoration: BoxDecoration(
                    color: isDark ? AppColors.surfaceDark : Colors.grey[200],
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: isDark ? Colors.grey[700]! : Colors.grey[400]!,
                      style: BorderStyle.solid,
                    ),
                  ),
                  child: Icon(
                    Icons.add_a_photo,
                    color: isDark ? Colors.grey[400] : Colors.grey[600],
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildFulfillmentStep(bool isDark) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Fulfillment Options',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : Colors.black,
            ),
          ),
          const SizedBox(height: 24),
          Row(
            children: [
              Expanded(
                child: _buildOptionCard(
                  title: 'Pickup & Drop',
                  icon: Icons.local_shipping,
                  isSelected: _fulfillmentType == 'pickup',
                  onTap: () => setState(() => _fulfillmentType = 'pickup'),
                  isDark: isDark,
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: _buildOptionCard(
                  title: 'Visit Shop',
                  icon: Icons.store,
                  isSelected: _fulfillmentType == 'shop',
                  onTap: () => setState(() => _fulfillmentType = 'shop'),
                  isDark: isDark,
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          if (_fulfillmentType == 'pickup') ...[
            Text(
              'Select Pickup Tier',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white : Colors.black,
              ),
            ),
            const SizedBox(height: 16),
            _buildTierOption('Regular', '1-3 Days', 'Standard processing',
                Colors.blue, isDark),
            _buildTierOption('Priority', 'Same Day', 'Faster processing',
                Colors.orange, isDark),
            _buildTierOption('Emergency', 'Within 2 Hours',
                'Immediate processing', Colors.red, isDark),
          ] else ...[
            Text(
              'Select Visit Date',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: isDark ? Colors.white : Colors.black,
              ),
            ),
            const SizedBox(height: 16),
            InkWell(
              onTap: () async {
                final date = await showDatePicker(
                  context: context,
                  initialDate: DateTime.now(),
                  firstDate: DateTime.now(),
                  lastDate: DateTime.now().add(const Duration(days: 30)),
                );
                if (date != null) {
                  setState(() => _scheduledDate = date);
                }
              },
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: isDark ? AppColors.surfaceDark : Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                      color: isDark ? Colors.grey[700]! : Colors.grey[300]!),
                ),
                child: Row(
                  children: [
                    Icon(Icons.calendar_today,
                        color: isDark ? Colors.white : Colors.black),
                    const SizedBox(width: 12),
                    Text(
                      _scheduledDate == null
                          ? 'Select Date'
                          : DateFormat('MMM dd, yyyy').format(_scheduledDate!),
                      style: TextStyle(
                        color: isDark ? Colors.white : Colors.black,
                        fontSize: 16,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildTierOption(
      String tier, String time, String desc, Color color, bool isDark) {
    final isSelected = _pickupTier == tier;
    return GestureDetector(
      onTap: () => setState(() => _pickupTier = tier),
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected
              ? color.withOpacity(0.1)
              : (isDark ? AppColors.surfaceDark : Colors.white),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected
                ? color
                : (isDark ? Colors.grey[800]! : Colors.grey[300]!),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: color.withOpacity(0.1),
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.speed, color: color),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    tier,
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      fontSize: 16,
                      color: isDark ? Colors.white : Colors.black,
                    ),
                  ),
                  Text(
                    time,
                    style: TextStyle(
                      color: color,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
            if (isSelected)
              Icon(Icons.check_circle, color: color)
            else
              const Icon(Icons.circle_outlined, color: Colors.grey),
          ],
        ),
      ),
    );
  }

  Widget _buildContactStep(bool isDark) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Contact Details',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : Colors.black,
            ),
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _nameController,
            decoration: InputDecoration(
              labelText: 'Name',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
              fillColor: isDark ? AppColors.surfaceDark : Colors.white,
            ),
            style: TextStyle(color: isDark ? Colors.white : Colors.black),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.number,
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(10),
              TextInputFormatter.withFunction((oldValue, newValue) {
                if (newValue.text.startsWith('0')) {
                  return newValue.copyWith(
                    text: newValue.text.replaceFirst('0', ''),
                    selection: newValue.selection.copyWith(
                      baseOffset: newValue.selection.baseOffset > 0
                          ? newValue.selection.baseOffset - 1
                          : 0,
                      extentOffset: newValue.selection.extentOffset > 0
                          ? newValue.selection.extentOffset - 1
                          : 0,
                    ),
                  );
                }
                return newValue;
              }),
            ],
            decoration: InputDecoration(
              labelText: 'Phone',
              prefixText: '+880 ',
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
              ),
              filled: true,
              fillColor: isDark ? AppColors.surfaceDark : Colors.white,
            ),
            style: TextStyle(color: isDark ? Colors.white : Colors.black),
          ),
          if (_fulfillmentType == 'pickup') ...[
            const SizedBox(height: 16),
            TextField(
              controller: _addressController,
              maxLines: 3,
              decoration: InputDecoration(
                labelText: 'Pickup Address',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                filled: true,
                fillColor: isDark ? AppColors.surfaceDark : Colors.white,
              ),
              style: TextStyle(color: isDark ? Colors.white : Colors.black),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildSummaryStep(bool isDark) {
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Order Summary',
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : Colors.black,
            ),
          ),
          const SizedBox(height: 24),
          _buildSummaryCard(
            title: 'Items',
            content: Column(
              children: widget.items
                  .map((item) => Padding(
                        padding: const EdgeInsets.only(bottom: 8),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text('${item.product.name} x${item.quantity}',
                                style: TextStyle(
                                    color:
                                        isDark ? Colors.white : Colors.black)),
                            Text('৳${item.totalPrice}',
                                style: TextStyle(
                                    fontWeight: FontWeight.bold,
                                    color:
                                        isDark ? Colors.white : Colors.black)),
                          ],
                        ),
                      ))
                  .toList(),
            ),
            isDark: isDark,
          ),
          const SizedBox(height: 16),
          _buildSummaryCard(
            title: 'Device Info',
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Brand: $_selectedBrand',
                    style: TextStyle(
                        color: isDark ? Colors.grey[300] : Colors.grey[800])),
                Text('Model: ${_modelController.text}',
                    style: TextStyle(
                        color: isDark ? Colors.grey[300] : Colors.grey[800])),
                Text('Issue: $_primaryIssue',
                    style: TextStyle(
                        color: isDark ? Colors.grey[300] : Colors.grey[800])),
              ],
            ),
            isDark: isDark,
          ),
          const SizedBox(height: 16),
          _buildSummaryCard(
            title: 'Fulfillment',
            content: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                    'Type: ${_fulfillmentType == 'pickup' ? 'Pickup & Drop' : 'Shop Visit'}',
                    style: TextStyle(
                        color: isDark ? Colors.grey[300] : Colors.grey[800])),
                if (_fulfillmentType == 'pickup')
                  Text('Tier: $_pickupTier',
                      style: TextStyle(
                          color: isDark ? Colors.grey[300] : Colors.grey[800])),
                if (_fulfillmentType == 'shop' && _scheduledDate != null)
                  Text(
                      'Date: ${DateFormat('MMM dd, yyyy').format(_scheduledDate!)}',
                      style: TextStyle(
                          color: isDark ? Colors.grey[300] : Colors.grey[800])),
              ],
            ),
            isDark: isDark,
          ),
          const SizedBox(height: 24),
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.1),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: AppColors.primary),
            ),
            child: const Row(
              children: [
                Icon(Icons.info_outline, color: AppColors.primary),
                SizedBox(width: 12),
                Expanded(
                  child: Text(
                    'Service charges will be quoted after verification.',
                    style: TextStyle(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildSummaryCard(
      {required String title, required Widget content, required bool isDark}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.grey[400] : Colors.grey[600],
            ),
          ),
          const SizedBox(height: 12),
          content,
        ],
      ),
    );
  }

  Widget _buildDropdown(
      {required String label,
      required String? value,
      required List<String> items,
      required Function(String?) onChanged,
      required bool isDark}) {
    return DropdownButtonFormField<String>(
      value: value,
      items: items
          .map((item) => DropdownMenuItem(
                value: item,
                child: Text(item),
              ))
          .toList(),
      onChanged: onChanged,
      decoration: InputDecoration(
        labelText: label,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: isDark ? AppColors.surfaceDark : Colors.white,
      ),
      dropdownColor: isDark ? AppColors.surfaceDark : Colors.white,
      style: TextStyle(color: isDark ? Colors.white : Colors.black),
    );
  }

  Widget _buildOptionCard(
      {required String title,
      required IconData icon,
      required bool isSelected,
      required VoidCallback onTap,
      required bool isDark}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withOpacity(0.1)
              : (isDark ? AppColors.surfaceDark : Colors.white),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected
                ? AppColors.primary
                : (isDark ? Colors.grey[800]! : Colors.grey[300]!),
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          children: [
            Icon(
              icon,
              size: 32,
              color: isSelected
                  ? AppColors.primary
                  : (isDark ? Colors.grey[400] : Colors.grey[600]),
            ),
            const SizedBox(height: 12),
            Text(
              title,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                color: isSelected
                    ? AppColors.primary
                    : (isDark ? Colors.white : Colors.black),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildBottomBar(bool isDark) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: isDark ? AppColors.surfaceDark : Colors.white,
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.1),
            blurRadius: 10,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: Row(
        children: [
          if (_currentStep > 0)
            Expanded(
              child: OutlinedButton(
                onPressed: _isSubmitting ? null : _prevStep,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  side: const BorderSide(color: AppColors.primary),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                  ),
                ),
                child: const Text('Back'),
              ),
            ),
          if (_currentStep > 0) const SizedBox(width: 16),
          Expanded(
            flex: 2,
            child: ElevatedButton(
              onPressed: _isSubmitting ? null : _nextStep,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: _isSubmitting
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2),
                    )
                  : Text(_currentStep == _totalSteps - 1
                      ? 'Submit Order'
                      : 'Next Step'),
            ),
          ),
        ],
      ),
    );
  }
}
