import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:provider/provider.dart';
import '../../config/app_theme.dart';
import '../../providers/auth_provider.dart';
import '../../providers/locale_provider.dart';

class CompleteProfileSheet extends StatefulWidget {
  final bool isDismissible;

  const CompleteProfileSheet({
    super.key,
    this.isDismissible = true,
  });

  @override
  State<CompleteProfileSheet> createState() => _CompleteProfileSheetState();
}

class _CompleteProfileSheetState extends State<CompleteProfileSheet> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _addressController = TextEditingController();
  final _nameController = TextEditingController();

  bool _isLoading = false;

  @override
  void initState() {
    super.initState();
    // Pre-fill data if available
    final user = Provider.of<AuthProvider>(context, listen: false).user;
    if (user != null) {
      if (user.phone != null) {
          String phone = user.phone!;
          if(phone.startsWith('+880')){
              phone = phone.substring(4);
          }
          _phoneController.text = phone;
      }
      if (user.address != null) _addressController.text = user.address!;
      if (user.name != null) _nameController.text = user.name!;
    }
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _addressController.dispose();
    _nameController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      final auth = Provider.of<AuthProvider>(context, listen: false);
      
      String phone = _phoneController.text.trim();
      if (!phone.startsWith('+880')) {
        phone = '+880$phone';
      }

      final success = await auth.updateProfile(
        phone: phone,
        address: _addressController.text.trim(),
        name: _nameController.text.trim(), // In case they want to update name too
      );

      if (success && mounted) {
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(Provider.of<LocaleProvider>(context, listen: false).isBangla
                ? 'প্রোফাইল আপডেট সফল হয়েছে'
                : 'Profile updated successfully'),
            backgroundColor: Colors.green,
          ),
        );
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(auth.error ?? 'Failed to update profile'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final isBangla = Provider.of<LocaleProvider>(context).isBangla;
    final size = MediaQuery.of(context).size;

    return PopScope(
      canPop: widget.isDismissible,
      child: Container(
        padding: EdgeInsets.only(
          bottom: MediaQuery.of(context).viewInsets.bottom,
          left: 24,
          right: 24,
          top: 24,
        ),
        decoration: BoxDecoration(
          color: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: SingleChildScrollView(
          child: Form(
            key: _formKey,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Handle bar
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: isDark ? Colors.grey[700] : Colors.grey[300],
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 24),

                // Title
                Text(
                  isBangla ? 'আপনার প্রোফাইল সম্পূর্ণ করুন' : 'Complete Your Profile',
                  style: TextStyle(
                    fontSize: 20,
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  isBangla
                      ? 'সেবা অনুরোধ করার জন্য আপনার ফোন নম্বর এবং ঠিকানা প্রয়োজন'
                      : 'Phone number and address are required to request services.',
                  style: TextStyle(
                    fontSize: 14,
                    color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 24),
                
                // Name Field (Read Only or Editable - let's make it editable)
                _buildTextField(
                  controller: _nameController,
                  label: isBangla ? 'আপনার নাম' : 'Your Name',
                  icon: Icons.person_outline,
                  isDark: isDark,
                  validator: (v) => v == null || v.isEmpty ? (isBangla ? 'নাম আবশ্যক' : 'Name is required') : null,
                ),
                const SizedBox(height: 16),

                // Phone Field
                _buildTextField(
                  controller: _phoneController,
                  label: isBangla ? 'মোবাইল নম্বর' : 'Mobile Number',
                  icon: Icons.phone_outlined,
                  isDark: isDark,
                  keyboardType: TextInputType.number,
                  prefixText: '+880 ',
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return isBangla ? 'মোবাইল নম্বর লিখুন' : 'Please enter mobile number';
                    }
                    if (value.length != 10) {
                      return isBangla ? 'মোবাইল নম্বর ১০ সংখ্যার হতে হবে' : 'Mobile number must be 10 digits';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                // Address Field
                _buildTextField(
                  controller: _addressController,
                  label: isBangla ? 'ঠিকানা' : 'Address',
                  icon: Icons.location_on_outlined,
                  isDark: isDark,
                  maxLines: 2,
                  validator: (v) => v == null || v.isEmpty ? (isBangla ? 'ঠিকানা আবশ্যক' : 'Address is required') : null,
                ),
                const SizedBox(height: 24),

                // Buttons
                Row(
                  children: [
                    if (widget.isDismissible) ...[
                      Expanded(
                        child: TextButton(
                          onPressed: () => Navigator.pop(context),
                          child: Text(
                            isBangla ? 'পরে করব' : 'Skip for Now',
                            style: TextStyle(
                              color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                    ],
                    Expanded(
                      flex: 2,
                      child: ElevatedButton(
                        onPressed: _isLoading ? null : _handleSubmit,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 16),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: _isLoading
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Colors.white,
                                ),
                              )
                            : Text(isBangla ? 'সংরক্ষণ করুন' : 'Save & Continue'),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    required bool isDark,
    TextInputType? keyboardType,
    int maxLines = 1,
    String? prefixText,
    List<TextInputFormatter>? inputFormatters,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      maxLines: maxLines,
      inputFormatters: inputFormatters,
      validator: validator,
      style: TextStyle(
        color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
      ),
      decoration: InputDecoration(
        labelText: label,
        prefixText: prefixText,
        prefixStyle: TextStyle(
          color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
          fontSize: 16,
        ),
        labelStyle: TextStyle(
          color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
        ),
        prefixIcon: Icon(
          icon,
          color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
        ),
        filled: true,
        fillColor: isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Colors.red, width: 1),
        ),
      ),
    );
  }
}
