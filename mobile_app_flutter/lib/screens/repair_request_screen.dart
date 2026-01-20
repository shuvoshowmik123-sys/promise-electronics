import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/repair_provider.dart';
import '../providers/locale_provider.dart';
import '../providers/auth_provider.dart';
import '../providers/shuvo_mode_provider.dart';
import '../widgets/common/skeleton.dart';

class RepairRequestScreen extends StatefulWidget {
  const RepairRequestScreen({super.key});

  @override
  State<RepairRequestScreen> createState() => _RepairRequestScreenState();
}

class _RepairRequestScreenState extends State<RepairRequestScreen> {
  final PageController _pageController = PageController();
  int _currentStep = 0;
  final int _totalSteps = 5;

  // Form Data
  String? _selectedBrand;
  String? _selectedSize;
  final TextEditingController _modelController = TextEditingController();

  String? _primaryIssue;
  final List<String> _selectedSymptoms = [];
  final TextEditingController _descriptionController = TextEditingController();

  String _serviceType = 'pickup'; // 'pickup' or 'carry_in'
  final TextEditingController _addressController = TextEditingController();
  DateTime? _selectedDate;

  final TextEditingController _nameController = TextEditingController();
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _passwordController = TextEditingController();
  final TextEditingController _confirmPasswordController =
      TextEditingController();

  @override
  void initState() {
    super.initState();
    // Fetch settings
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<RepairProvider>().fetchSettings();

      // Pre-fill user data if logged in
      final user = context.read<AuthProvider>().user;
      if (user != null) {
        _nameController.text = user.name ?? '';
        // Handle phone number pre-fill: strip +880 if present
        String phone = user.phone ?? '';
        if (phone.startsWith('+880')) {
          phone = phone.substring(4);
        } else if (phone.startsWith('880')) {
          phone = phone.substring(3);
        } else if (phone.startsWith('0')) {
          phone = phone.substring(1);
        }
        _phoneController.text = phone;

        if (user.address != null) {
          _addressController.text = user.address!;
        }
      }
    });
  }

  @override
  void dispose() {
    _pageController.dispose();
    _modelController.dispose();
    _descriptionController.dispose();
    _addressController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    super.dispose();
  }

  void _nextStep() {
    if (_currentStep < _totalSteps - 1) {
      if (_validateStep(_currentStep)) {
        _pageController.nextPage(
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeInOut,
        );
        setState(() => _currentStep++);
      }
    } else {
      _submitRequest();
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
    // Shuvo Mode bypass - skip all validation
    if (context.read<ShuvoModeProvider>().isEnabled) {
      return true;
    }

    switch (step) {
      case 0: // Device
        if (_selectedBrand == null) {
          _showError(
              Provider.of<LocaleProvider>(context, listen: false).isBangla
                  ? 'অনুগ্রহ করে ব্র্যান্ড নির্বাচন করুন'
                  : 'Please select a brand');
          return false;
        }
        if (_selectedSize == null) {
          _showError(
              Provider.of<LocaleProvider>(context, listen: false).isBangla
                  ? 'অনুগ্রহ করে স্ক্রিন সাইজ নির্বাচন করুন'
                  : 'Please select a screen size');
          return false;
        }
        return true;
      case 1: // Issue
        if (_primaryIssue == null) {
          _showError('Please select a primary issue');
          return false;
        }
        if (_selectedSymptoms.isEmpty) {
          _showError('Please select at least one symptom');
          return false;
        }
        return true;
      case 2: // Service
        if (_serviceType == 'pickup' && _addressController.text.isEmpty) {
          _showError('Please enter your address');
          return false;
        }
        if (_serviceType == 'carry_in' && _selectedDate == null) {
          _showError('Please select a date');
          return false;
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
        if (_phoneController.text.length != 10) {
          _showError('Please enter a valid 10-digit phone number');
          return false;
        }
        final isAuth = context.read<AuthProvider>().isAuthenticated;
        if (!isAuth) {
          if (_passwordController.text.isEmpty ||
              _passwordController.text.length < 6) {
            _showError('Password must be at least 6 characters');
            return false;
          }
          if (_passwordController.text != _confirmPasswordController.text) {
            _showError('Passwords do not match');
            return false;
          }
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

  Future<void> _submitRequest() async {
    final data = {
      'brand': _selectedBrand,
      'screenSize': _selectedSize,
      'modelNumber': _modelController.text,
      'primaryIssue': _primaryIssue,
      'symptoms': jsonEncode(_selectedSymptoms), // Native sends as JSON string
      'description': _descriptionController.text,
      'servicePreference':
          _serviceType == 'pickup' ? 'home_pickup' : 'service_center',
      'address': _addressController.text,
      'scheduledPickupDate': _selectedDate?.toIso8601String(),
      'customerName': _nameController.text,
      'phone': '+880${_phoneController.text}', // Add prefix
      // If not auth, send password for registration
      if (!context.read<AuthProvider>().isAuthenticated)
        'password': _passwordController.text,
      'status': 'Pending',
      'requestIntent': 'repair',
    };

    final success = await context.read<RepairProvider>().submitRequest(data);

    if (success && mounted) {
      showDialog(
        context: context,
        barrierDismissible: false,
        builder: (context) => AlertDialog(
          title: const Text('Request Submitted'),
          content: const Text(
              'Your repair request has been submitted successfully. We will contact you shortly.'),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context); // Close dialog
                Navigator.pop(context); // Close screen
              },
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } else if (mounted) {
      _showError(context.read<RepairProvider>().error ?? 'Submission failed');
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      body: SafeArea(
        child: Column(
          children: [
            // Header
            _buildHeader(context, isDark),

            // Progress Bar
            LinearProgressIndicator(
              value: (_currentStep + 1) / _totalSteps,
              backgroundColor:
                  isDark ? AppColors.surfaceDark : Colors.grey[200],
              valueColor:
                  const AlwaysStoppedAnimation<Color>(AppColors.primary),
            ),

            // Content
            Expanded(
              child: PageView(
                controller: _pageController,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  _buildDeviceStep(isDark),
                  _buildIssueStep(isDark),
                  _buildServiceStep(isDark),
                  _buildContactStep(isDark),
                  _buildSummaryStep(isDark),
                ],
              ),
            ),

            // Bottom Bar
            _buildBottomBar(isDark),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(BuildContext context, bool isDark) {
    final isShuvoMode = context.watch<ShuvoModeProvider>().isEnabled;

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Row(
        children: [
          IconButton(
            icon: Icon(Icons.arrow_back,
                color: isDark ? Colors.white : Colors.black),
            onPressed: _prevStep,
          ),
          Text(
            Provider.of<LocaleProvider>(context).isBangla
                ? 'মেরামত অনুরোধ'
                : 'Repair Request',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.bold,
              color: isDark ? Colors.white : Colors.black,
            ),
          ),
          const Spacer(),
          // Shuvo Mode Quick Test Button
          if (isShuvoMode)
            TextButton.icon(
              onPressed: () async {
                final shuvoProvider = context.read<ShuvoModeProvider>();
                final repairProvider = context.read<RepairProvider>();
                final testData = shuvoProvider.getTestRequestData();

                final success = await repairProvider.submitRequest(testData);

                if (!context.mounted) return;

                if (success) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(
                      content: Text('✅ Test request submitted!'),
                      backgroundColor: Colors.green,
                    ),
                  );
                  Navigator.pop(context);
                } else {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('❌ Failed: ${repairProvider.error}'),
                      backgroundColor: Colors.red,
                    ),
                  );
                }
              },
              icon: const Icon(Icons.bolt, color: Colors.orange, size: 18),
              label: const Text(
                'QUICK TEST',
                style: TextStyle(
                  color: Colors.orange,
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                ),
              ),
              style: TextButton.styleFrom(
                backgroundColor: Colors.orange.withOpacity(0.1),
                padding:
                    const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              ),
            ),
          if (!isShuvoMode)
            Text(
              Provider.of<LocaleProvider>(context).isBangla
                  ? 'ধাপ ${_currentStep + 1}/$_totalSteps'
                  : 'Step ${_currentStep + 1}/$_totalSteps',
              style: TextStyle(
                color: isDark ? Colors.grey[400] : Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
        ],
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
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, -5),
          ),
        ],
      ),
      child: Row(
        children: [
          if (_currentStep > 0)
            Expanded(
              child: OutlinedButton(
                onPressed: _prevStep,
                style: OutlinedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 16),
                  side: BorderSide(
                      color: isDark ? Colors.grey[700]! : Colors.grey[300]!),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12)),
                ),
                child: Text(
                    Provider.of<LocaleProvider>(context).isBangla
                        ? 'পেছনে'
                        : 'Back',
                    style:
                        TextStyle(color: isDark ? Colors.white : Colors.black)),
              ),
            ),
          if (_currentStep > 0) const SizedBox(width: 16),
          Expanded(
            flex: 2,
            child: ElevatedButton(
              onPressed:
                  context.watch<RepairProvider>().isLoading ? null : _nextStep,
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                padding: const EdgeInsets.symmetric(vertical: 16),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              child: context.watch<RepairProvider>().isLoading
                  ? const SizedBox(
                      height: 20,
                      width: 20,
                      child: CircularProgressIndicator(
                          color: Colors.black, strokeWidth: 2))
                  : Text(
                      _currentStep == _totalSteps - 1
                          ? (Provider.of<LocaleProvider>(context).isBangla
                              ? 'জমা দিন'
                              : 'Submit Request')
                          : (Provider.of<LocaleProvider>(context).isBangla
                              ? 'পরবর্তী'
                              : 'Next'),
                      style: const TextStyle(
                          color: Colors.black, fontWeight: FontWeight.bold),
                    ),
            ),
          ),
        ],
      ),
    );
  }

  // --- Step 1: Device ---
  Widget _buildDeviceStep(bool isDark) {
    return Consumer<RepairProvider>(
      builder: (context, provider, _) {
        if (provider.isLoading && provider.brands.isEmpty) {
          return Padding(
            padding: const EdgeInsets.all(20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Skeleton(height: 24, width: 120),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: List.generate(
                    4,
                    (index) =>
                        const Skeleton(height: 40, width: 80, borderRadius: 20),
                  ),
                ),
                const SizedBox(height: 24),
                const Skeleton(height: 24, width: 150),
                const SizedBox(height: 12),
                Wrap(
                  spacing: 10,
                  runSpacing: 10,
                  children: List.generate(
                    3,
                    (index) =>
                        const Skeleton(height: 40, width: 60, borderRadius: 20),
                  ),
                ),
                const SizedBox(height: 24),
                const Skeleton(height: 24, width: 180),
                const SizedBox(height: 12),
                const Skeleton(
                    height: 50, width: double.infinity, borderRadius: 12),
              ],
            ),
          );
        }
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
                Provider.of<LocaleProvider>(context).isBangla
                    ? 'ব্র্যান্ড নির্বাচন করুন'
                    : 'Select Brand',
                style: _headerStyle(isDark)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: provider.brands
                  .map((brand) => _buildSelectionChip(
                        label: brand,
                        isSelected: _selectedBrand == brand,
                        onTap: () => setState(() => _selectedBrand = brand),
                        isDark: isDark,
                      ))
                  .toList(),
            ),
            const SizedBox(height: 24),
            Text(
                Provider.of<LocaleProvider>(context).isBangla
                    ? 'স্ক্রিন সাইজ নির্বাচন করুন'
                    : 'Select Screen Size',
                style: _headerStyle(isDark)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: provider.screenSizes
                  .map((size) => _buildSelectionChip(
                        label: size,
                        isSelected: _selectedSize == size,
                        onTap: () => setState(() => _selectedSize = size),
                        isDark: isDark,
                      ))
                  .toList(),
            ),
            const SizedBox(height: 24),
            Text(
                Provider.of<LocaleProvider>(context).isBangla
                    ? 'মডেল নম্বর (ঐচ্ছিক)'
                    : 'Model Number (Optional)',
                style: _headerStyle(isDark)),
            const SizedBox(height: 12),
            TextField(
              controller: _modelController,
              decoration: _inputDecoration(
                  Provider.of<LocaleProvider>(context).isBangla
                      ? 'মডেল নম্বর লিখুন'
                      : 'Enter model number',
                  isDark),
              style: TextStyle(color: isDark ? Colors.white : Colors.black),
            ),
          ],
        );
      },
    );
  }

  // --- Step 2: Issue ---
  Widget _buildIssueStep(bool isDark) {
    return Consumer<RepairProvider>(
      builder: (context, provider, _) {
        return ListView(
          padding: const EdgeInsets.all(20),
          children: [
            Text(
                Provider.of<LocaleProvider>(context).isBangla
                    ? 'প্রাথমিক সমস্যা'
                    : 'Primary Issue',
                style: _headerStyle(isDark)),
            const SizedBox(height: 12),
            Container(
              decoration: BoxDecoration(
                color: isDark ? AppColors.surfaceDark : Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                    color: isDark ? Colors.grey[800]! : Colors.grey[300]!),
              ),
              child: Column(
                children: provider.serviceCategories
                    .map((category) => RadioListTile<String>(
                          title: Text(category,
                              style: TextStyle(
                                  color:
                                      isDark ? Colors.white : Colors.black)),
                          value: category,
                          groupValue: _primaryIssue,
                          onChanged: (value) => setState(() => _primaryIssue = value),
                          activeColor: AppColors.primary,
                          contentPadding:
                              const EdgeInsets.symmetric(horizontal: 16),
                        ))
                    .toList(),
              ),
            ),
            const SizedBox(height: 24),
            Text(
                Provider.of<LocaleProvider>(context).isBangla
                    ? 'সাধারণ লক্ষণ'
                    : 'Common Symptoms',
                style: _headerStyle(isDark)),
            const SizedBox(height: 12),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: provider.symptoms.isNotEmpty
                  ? provider.symptoms
                      .map((symptom) => _buildSelectionChip(
                            label: symptom,
                            isSelected: _selectedSymptoms.contains(symptom),
                            onTap: () {
                              setState(() {
                                if (_selectedSymptoms.contains(symptom)) {
                                  _selectedSymptoms.remove(symptom);
                                } else {
                                  _selectedSymptoms.add(symptom);
                                }
                              });
                            },
                            isDark: isDark,
                          ))
                      .toList()
                  : ['No Power', 'No Sound', 'Broken Screen', 'Lines on Screen']
                      .map((s) => _buildSelectionChip(
                            label: s,
                            isSelected: _selectedSymptoms.contains(s),
                            onTap: () {
                              setState(() {
                                if (_selectedSymptoms.contains(s)) {
                                  _selectedSymptoms.remove(s);
                                } else {
                                  _selectedSymptoms.add(s);
                                }
                              });
                            },
                            isDark: isDark,
                          ))
                      .toList(),
            ),
            const SizedBox(height: 24),
            Text(
                Provider.of<LocaleProvider>(context).isBangla
                    ? 'বিবরণ (ঐচ্ছিক)'
                    : 'Description (Optional)',
                style: _headerStyle(isDark)),
            const SizedBox(height: 12),
            TextField(
              controller: _descriptionController,
              maxLines: 4,
              decoration: _inputDecoration(
                  Provider.of<LocaleProvider>(context).isBangla
                      ? 'কি সমস্যা হচ্ছে বর্ণনা করুন...'
                      : 'Describe what\'s wrong...',
                  isDark),
              style: TextStyle(color: isDark ? Colors.white : Colors.black),
            ),
          ],
        );
      },
    );
  }

  // --- Step 3: Service ---
  Widget _buildServiceStep(bool isDark) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
            Provider.of<LocaleProvider>(context).isBangla
                ? 'সার্ভিস টাইপ'
                : 'Service Type',
            style: _headerStyle(isDark)),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: _buildServiceCard(
                title: Provider.of<LocaleProvider>(context).isBangla
                    ? 'হোম পিকআপ'
                    : 'Home Pickup',
                icon: Icons.local_shipping,
                isSelected: _serviceType == 'pickup',
                onTap: () => setState(() => _serviceType = 'pickup'),
                isDark: isDark,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: _buildServiceCard(
                title: Provider.of<LocaleProvider>(context).isBangla
                    ? 'সেন্টারে আসুন'
                    : 'Visit Center',
                icon: Icons.store,
                isSelected: _serviceType == 'carry_in',
                onTap: () => setState(() => _serviceType = 'carry_in'),
                isDark: isDark,
              ),
            ),
          ],
        ),
        const SizedBox(height: 24),
        if (_serviceType == 'pickup') ...[
          Text(
              Provider.of<LocaleProvider>(context).isBangla
                  ? 'পিকআপ ঠিকানা'
                  : 'Pickup Address',
              style: _headerStyle(isDark)),
          const SizedBox(height: 12),
          TextField(
            controller: _addressController,
            maxLines: 3,
            decoration: _inputDecoration(
                Provider.of<LocaleProvider>(context).isBangla
                    ? 'সম্পূর্ণ ঠিকানা লিখুন'
                    : 'Enter full address',
                isDark),
            style: TextStyle(color: isDark ? Colors.white : Colors.black),
          ),
        ] else ...[
          Text(
              Provider.of<LocaleProvider>(context).isBangla
                  ? 'তারিখ নির্বাচন করুন'
                  : 'Select Date',
              style: _headerStyle(isDark)),
          const SizedBox(height: 12),
          InkWell(
            onTap: () async {
              final date = await showDatePicker(
                context: context,
                initialDate: DateTime.now().add(const Duration(days: 1)),
                firstDate: DateTime.now(),
                lastDate: DateTime.now().add(const Duration(days: 30)),
                selectableDayPredicate: (DateTime val) =>
                    val.weekday != DateTime.friday, // Block Fridays
                builder: (context, child) {
                  return Theme(
                    data: isDark ? ThemeData.dark() : ThemeData.light(),
                    child: child!,
                  );
                },
              );
              if (date != null && mounted) {
                setState(() => _selectedDate = date);
              }
            },
            child: Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                border: Border.all(
                    color: isDark ? Colors.grey[700]! : Colors.grey[300]!),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  Icon(Icons.calendar_today,
                      color: isDark ? Colors.white : Colors.black),
                  const SizedBox(width: 12),
                  Text(
                    _selectedDate == null
                        ? (Provider.of<LocaleProvider>(context).isBangla
                            ? 'একটি তারিখ নির্বাচন করুন'
                            : 'Choose a date')
                        : '${_selectedDate!.day}/${_selectedDate!.month}/${_selectedDate!.year}',
                    style:
                        TextStyle(color: isDark ? Colors.white : Colors.black),
                  ),
                ],
              ),
            ),
          ),
        ],
      ],
    );
  }

  // --- Step 4: Contact ---
  Widget _buildContactStep(bool isDark) {
    final isAuth = context.watch<AuthProvider>().isAuthenticated;

    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
            Provider.of<LocaleProvider>(context).isBangla
                ? 'যোগাযোগের বিবরণ'
                : 'Contact Details',
            style: _headerStyle(isDark)),
        const SizedBox(height: 20),
        TextField(
          controller: _nameController,
          decoration: _inputDecoration(
              Provider.of<LocaleProvider>(context).isBangla
                  ? 'পুরো নাম'
                  : 'Full Name',
              isDark,
              icon: Icons.person),
          style: TextStyle(color: isDark ? Colors.white : Colors.black),
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _phoneController,
          keyboardType: TextInputType.phone,
          inputFormatters: [FilteringTextInputFormatter.digitsOnly],
          decoration: _inputDecoration('1XXXXXXXXX', isDark, icon: Icons.phone)
              .copyWith(
            prefixText: '+880 ',
            prefixStyle: TextStyle(
              color: isDark ? Colors.white : Colors.black,
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
          style: TextStyle(
            color: isDark ? Colors.white : Colors.black,
            fontSize: 16,
          ),
          onChanged: (value) {
            if (value.startsWith('0')) {
              _phoneController.text = value.substring(1);
              _phoneController.selection = TextSelection.fromPosition(
                TextPosition(offset: _phoneController.text.length),
              );
            }
          },
        ),
        if (!isAuth) ...[
          const SizedBox(height: 24),
          Text(
              Provider.of<LocaleProvider>(context).isBangla
                  ? 'অ্যাকাউন্ট তৈরি করুন'
                  : 'Create Account',
              style: _headerStyle(isDark)),
          const SizedBox(height: 8),
          Text(
            Provider.of<LocaleProvider>(context).isBangla
                ? 'আপনার মেরামতের স্থিতি ট্র্যাক করতে একটি পাসওয়ার্ড সেট করুন।'
                : 'Set a password to track your repair status.',
            style: TextStyle(
                color: isDark ? Colors.grey[400] : Colors.grey[600],
                fontSize: 13),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _passwordController,
            obscureText: true,
            decoration: _inputDecoration(
                Provider.of<LocaleProvider>(context).isBangla
                    ? 'পাসওয়ার্ড (কমপক্ষে ৬ অক্ষর)'
                    : 'Password (min 6 chars)',
                isDark,
                icon: Icons.lock),
            style: TextStyle(color: isDark ? Colors.white : Colors.black),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _confirmPasswordController,
            obscureText: true,
            decoration: _inputDecoration(
                Provider.of<LocaleProvider>(context).isBangla
                    ? 'পাসওয়ার্ড নিশ্চিত করুন'
                    : 'Confirm Password',
                isDark,
                icon: Icons.lock_outline),
            style: TextStyle(color: isDark ? Colors.white : Colors.black),
          ),
        ],
        const SizedBox(height: 24),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: AppColors.primary.withOpacity(0.1),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppColors.primary.withOpacity(0.3)),
          ),
          child: Row(
            children: [
              const Icon(Icons.info_outline, color: AppColors.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Text(
                  Provider.of<LocaleProvider>(context).isBangla
                      ? 'আমরা মেরামতের বিবরণ এবং সময়সূচী নিশ্চিত করতে আপনার সাথে যোগাযোগ করব।'
                      : 'We will contact you to confirm the repair details and schedule.',
                  style: const TextStyle(fontSize: 13),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // --- Step 5: Summary ---
  Widget _buildSummaryStep(bool isDark) {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        Text(
            Provider.of<LocaleProvider>(context).isBangla
                ? 'অনুরোধ পর্যালোচনা করুন'
                : 'Review Request',
            style: _headerStyle(isDark)),
        const SizedBox(height: 20),
        _buildSummaryItem('Device', '$_selectedBrand $_selectedSize', isDark),
        if (_modelController.text.isNotEmpty)
          _buildSummaryItem('Model', _modelController.text, isDark),
        _buildSummaryItem('Issue', _primaryIssue ?? 'Not selected', isDark),
        _buildSummaryItem('Symptoms', _selectedSymptoms.join(', '), isDark),
        if (_descriptionController.text.isNotEmpty)
          _buildSummaryItem('Description', _descriptionController.text, isDark),
        _buildSummaryItem('Service',
            _serviceType == 'pickup' ? 'Home Pickup' : 'Visit Center', isDark),
        if (_serviceType == 'pickup')
          _buildSummaryItem('Address', _addressController.text, isDark)
        else if (_selectedDate != null)
          _buildSummaryItem(
              'Date',
              '${_selectedDate!.day}/${_selectedDate!.month}/${_selectedDate!.year}',
              isDark),
        _buildSummaryItem('Contact',
            '${_nameController.text}\n+880${_phoneController.text}', isDark),
      ],
    );
  }

  // --- Helpers ---

  TextStyle _headerStyle(bool isDark) {
    return TextStyle(
      fontSize: 18,
      fontWeight: FontWeight.bold,
      color: isDark ? Colors.white : Colors.black,
    );
  }

  InputDecoration _inputDecoration(String hint, bool isDark, {IconData? icon}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: TextStyle(color: isDark ? Colors.grey[600] : Colors.grey[400]),
      prefixIcon: icon != null
          ? Icon(icon, color: isDark ? Colors.grey[400] : Colors.grey[600])
          : null,
      filled: true,
      fillColor: isDark ? AppColors.surfaceDark : Colors.grey[100],
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide.none,
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.primary),
      ),
    );
  }

  Widget _buildSelectionChip({
    required String label,
    required bool isSelected,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary
              : (isDark ? AppColors.surfaceDark : Colors.grey[200]),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? AppColors.primary : Colors.transparent,
          ),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: isSelected
                ? Colors.black
                : (isDark ? Colors.white : Colors.black),
            fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
          ),
        ),
      ),
    );
  }

  Widget _buildServiceCard({
    required String title,
    required IconData icon,
    required bool isSelected,
    required VoidCallback onTap,
    required bool isDark,
  }) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 24),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withOpacity(0.1)
              : (isDark ? AppColors.surfaceDark : Colors.grey[100]),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isSelected ? AppColors.primary : Colors.transparent,
            width: 2,
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
                fontSize: 16,
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

  Widget _buildSummaryItem(String label, String value, bool isDark) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 100,
            child: Text(
              label,
              style: TextStyle(
                color: isDark ? Colors.grey[400] : Colors.grey[600],
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
          Expanded(
            child: Text(
              value,
              style: TextStyle(
                color: isDark ? Colors.white : Colors.black,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
