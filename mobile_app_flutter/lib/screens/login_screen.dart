import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'package:provider/provider.dart';
import '../config/app_theme.dart';
import '../providers/auth_provider.dart';
import '../providers/locale_provider.dart';
import '../l10n/app_localizations.dart';

/// Login Screen
/// Premium design with phone/password and Google sign-in
class LoginScreen extends StatefulWidget {
  final bool fromProfile;

  const LoginScreen({super.key, this.fromProfile = false});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;
  bool _isLogin = true; // Toggle between login and register
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _addressController = TextEditingController();
  bool _agreedToTerms = false;

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    _nameController.dispose();
    _emailController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  Future<void> _handleSubmit() async {
    if (!_isLogin && !_agreedToTerms) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(Provider.of<LocaleProvider>(context, listen: false)
                  .isBangla
              ? 'অনুগ্রহ করে আমাদের শর্তাবলী এবং গোপনীয়তা নীতি নিশ্চিত করুন'
              : 'Please confirm you have read and agreed with our terms and conditions and privacy policy'),
          backgroundColor: Colors.red,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      );
      return;
    }

    if (!_formKey.currentState!.validate()) return;

    final auth = Provider.of<AuthProvider>(context, listen: false);

    String phone = _phoneController.text.trim();
    if (phone.startsWith('0')) {
      phone = phone.substring(1);
    }
    phone = '+880$phone';

    bool success;
    if (_isLogin) {
      success = await auth.login(
        phone,
        _passwordController.text,
      );
    } else {
      success = await auth.register(
        name: _nameController.text.trim(),
        phone: phone,
        password: _passwordController.text,
        email: _emailController.text.trim().isNotEmpty
            ? _emailController.text.trim()
            : null,
        address: _addressController.text.trim().isNotEmpty
            ? _addressController.text.trim()
            : null,
      );
    }

    if (success && mounted) {
      if (widget.fromProfile) {
        Navigator.pop(context);
      } else {
        Navigator.pushReplacementNamed(context, '/home');
      }
    } else if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(auth.error ?? 'An error occurred'),
          backgroundColor: Colors.red,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      );
    }
  }

  Future<void> _handleGoogleSignIn() async {
    final auth = Provider.of<AuthProvider>(context, listen: false);
    final success = await auth.loginWithGoogle();

    if (success && mounted) {
      if (widget.fromProfile) {
        Navigator.pop(context);
      } else {
        Navigator.pushReplacementNamed(context, '/home');
      }
    } else if (mounted && auth.error != null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(auth.error!),
          backgroundColor: Colors.red,
          behavior: SnackBarBehavior.floating,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final size = MediaQuery.of(context).size;
    final l10n = AppLocalizations.of(context);

    return Scaffold(
      backgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Top Bar with Back Button and Language Toggle
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  IconButton(
                    onPressed: () => Navigator.pop(context),
                    icon: Icon(
                      Icons.arrow_back,
                      color: isDark
                          ? AppColors.textMainDark
                          : AppColors.textMainLight,
                    ),
                  ),
                  _buildLanguageToggle(isDark),
                ],
              ),

              SizedBox(height: size.height * 0.02),

              // Logo and Title
              _buildHeader(isDark, l10n),

              SizedBox(height: size.height * 0.04),

              // Form
              _buildForm(isDark, l10n),

              const SizedBox(height: 24),

              // Submit Button
              _buildSubmitButton(isDark, l10n),

              const SizedBox(height: 24),

              // Divider
              _buildDivider(isDark, l10n),

              const SizedBox(height: 24),

              // Google Sign-In
              _buildGoogleButton(isDark, l10n),

              const SizedBox(height: 24),

              // Toggle Login/Register
              _buildToggle(isDark, l10n),

              const SizedBox(height: 16),

              // Skip for now
              _buildSkipButton(isDark, l10n),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLanguageToggle(bool isDark) {
    return Consumer<LocaleProvider>(
      builder: (context, localeProvider, _) {
        return Row(
          mainAxisAlignment: MainAxisAlignment.end,
          children: [
            Text(
              'EN',
              style: TextStyle(
                color: localeProvider.isEnglish
                    ? AppColors.primary
                    : (isDark ? AppColors.textSubDark : AppColors.textSubLight),
                fontWeight: localeProvider.isEnglish
                    ? FontWeight.bold
                    : FontWeight.normal,
                fontSize: 14,
              ),
            ),
            Switch(
              value: localeProvider.isBangla,
              onChanged: (_) => localeProvider.toggleLocale(),
              activeThumbColor: AppColors.primary,
              inactiveThumbColor: AppColors.primary,
              inactiveTrackColor: AppColors.primary.withValues(alpha: 0.3),
              trackOutlineColor: WidgetStateProperty.all(Colors.transparent),
            ),
            Text(
              'বাং',
              style: TextStyle(
                color: localeProvider.isBangla
                    ? AppColors.primary
                    : (isDark ? AppColors.textSubDark : AppColors.textSubLight),
                fontWeight: localeProvider.isBangla
                    ? FontWeight.bold
                    : FontWeight.normal,
                fontSize: 14,
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildHeader(bool isDark, AppLocalizations l10n) {
    return Column(
      children: [
        // Logo
        Container(
          width: 80,
          height: 80,
          decoration: BoxDecoration(
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [
                AppColors.primary,
                AppColors.primary.withValues(alpha: 0.8),
              ],
            ),
            borderRadius: BorderRadius.circular(20),
            boxShadow: [
              BoxShadow(
                color: AppColors.primary.withValues(alpha: 0.3),
                blurRadius: 20,
                offset: const Offset(0, 10),
              ),
            ],
          ),
          child: const Icon(Icons.tv, size: 40, color: Colors.white),
        ),

        const SizedBox(height: 24),

        // Title
        Text(
          l10n.appName,
          style: TextStyle(
            fontSize: 32,
            fontWeight: FontWeight.bold,
            color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
          ),
        ),

        const SizedBox(height: 8),

        Text(
          _isLogin
              ? (Provider.of<LocaleProvider>(context).isBangla
                  ? 'স্বাগতম!'
                  : 'Welcome back!')
              : (Provider.of<LocaleProvider>(context).isBangla
                  ? 'নতুন অ্যাকাউন্ট তৈরি করুন'
                  : 'Create a new account'),
          style: TextStyle(
            fontSize: 16,
            color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
          ),
        ),
      ],
    );
  }

  Widget _buildForm(bool isDark, AppLocalizations l10n) {
    return Form(
      key: _formKey,
      child: Column(
        children: [
          // Name field (register only)
          if (!_isLogin)
            _buildTextField(
              controller: _nameController,
              label: Provider.of<LocaleProvider>(context).isBangla
                  ? 'আপনার নাম'
                  : 'Your Name',
              icon: Icons.person_outline,
              isDark: isDark,
              validator: (value) {
                if (value == null || value.isEmpty) {
                  return Provider.of<LocaleProvider>(context, listen: false)
                          .isBangla
                      ? 'আপনার নাম লিখুন'
                      : 'Please enter your name';
                }
                return null;
              },
            ),

          if (!_isLogin) const SizedBox(height: 16),

          // Phone field
          _buildTextField(
            controller: _phoneController,
            label: Provider.of<LocaleProvider>(context).isBangla
                ? 'মোবাইল নম্বর'
                : 'Mobile Number',
            icon: Icons.phone_outlined,
            isDark: isDark,
            keyboardType: TextInputType.number,
            hintText: '1XXXXXXXXX',
            prefixText: '+880 ',
            inputFormatters: [
              FilteringTextInputFormatter.digitsOnly,
              LengthLimitingTextInputFormatter(10),
            ],
            onChanged: (value) {
              // Remove leading zero if entered
              if (value.startsWith('0')) {
                _phoneController.text = value.substring(1);
                _phoneController.selection = TextSelection.fromPosition(
                  TextPosition(offset: _phoneController.text.length),
                );
              }
            },
            validator: (value) {
              if (value == null || value.isEmpty) {
                return Provider.of<LocaleProvider>(context, listen: false)
                        .isBangla
                    ? 'মোবাইল নম্বর লিখুন'
                    : 'Please enter mobile number';
              }
              if (value.length != 10) {
                return Provider.of<LocaleProvider>(context, listen: false)
                        .isBangla
                    ? 'মোবাইল নম্বর ১০ সংখ্যার হতে হবে'
                    : 'Mobile number must be 10 digits';
              }
              return null;
            },
          ),

          const SizedBox(height: 16),

          // Email field (register only, optional)
          if (!_isLogin)
            _buildTextField(
              controller: _emailController,
              label: Provider.of<LocaleProvider>(context).isBangla
                  ? 'ইমেল (ঐচ্ছিক)'
                  : 'Email (Optional)',
              icon: Icons.email_outlined,
              isDark: isDark,
              keyboardType: TextInputType.emailAddress,
            ),

          if (!_isLogin) const SizedBox(height: 16),

          // Address field (register only, optional)
          if (!_isLogin)
            _buildTextField(
              controller: _addressController,
              label: Provider.of<LocaleProvider>(context).isBangla
                  ? 'ঠিকানা (ঐচ্ছিক)'
                  : 'Address (Optional)',
              icon: Icons.location_on_outlined,
              isDark: isDark,
              maxLines: 2,
            ),

          if (!_isLogin) const SizedBox(height: 16),

          // Password field
          _buildTextField(
            controller: _passwordController,
            label: Provider.of<LocaleProvider>(context).isBangla
                ? 'পাসওয়ার্ড'
                : 'Password',
            icon: Icons.lock_outlined,
            isDark: isDark,
            obscureText: _obscurePassword,
            suffixIcon: IconButton(
              icon: Icon(
                _obscurePassword ? Icons.visibility_off : Icons.visibility,
                color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
              ),
              onPressed: () =>
                  setState(() => _obscurePassword = !_obscurePassword),
            ),
            validator: (value) {
              if (value == null || value.isEmpty) {
                return Provider.of<LocaleProvider>(context, listen: false)
                        .isBangla
                    ? 'পাসওয়ার্ড দিন'
                    : 'Please enter password';
              }
              if (!_isLogin && value.length < 6) {
                return Provider.of<LocaleProvider>(context, listen: false)
                        .isBangla
                    ? 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে'
                    : 'Password must be at least 6 characters';
              }
              return null;
            },
          ),

          if (!_isLogin) ...[
            const SizedBox(height: 16),
            _buildTermsCheckbox(isDark),
          ],
        ],
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required IconData icon,
    required bool isDark,
    TextInputType? keyboardType,
    bool obscureText = false,
    Widget? suffixIcon,
    String? hintText,
    String? prefixText,
    int maxLines = 1,
    String? Function(String?)? validator,
    List<TextInputFormatter>? inputFormatters,
    void Function(String)? onChanged,
  }) {
    return TextFormField(
      controller: controller,
      keyboardType: keyboardType,
      obscureText: obscureText,
      validator: validator,
      maxLines: maxLines,
      inputFormatters: inputFormatters,
      onChanged: onChanged,
      style: TextStyle(
        color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
      ),
      decoration: InputDecoration(
        labelText: label,
        hintText: hintText,
        prefixText: prefixText,
        prefixStyle: TextStyle(
          color: isDark ? AppColors.textMainDark : AppColors.textMainLight,
          fontSize: 16,
        ),
        labelStyle: TextStyle(
          color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
        ),
        hintStyle: TextStyle(
          color: (isDark ? AppColors.textSubDark : AppColors.textSubLight)
              .withValues(alpha: 0.5),
        ),
        prefixIcon: Icon(
          icon,
          color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
        ),
        suffixIcon: suffixIcon,
        filled: true,
        fillColor: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
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
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: Colors.red, width: 2),
        ),
      ),
    );
  }

  Widget _buildSubmitButton(bool isDark, AppLocalizations l10n) {
    return Consumer<AuthProvider>(
      builder: (context, auth, child) {
        return ElevatedButton(
          onPressed: auth.isLoading ? null : _handleSubmit,
          style: ElevatedButton.styleFrom(
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
            elevation: 0,
            backgroundColor: (!_isLogin && !_agreedToTerms)
                ? (isDark ? AppColors.surfaceDark : Colors.grey.shade300)
                : AppColors.primary,
          ),
          child: auth.isLoading
              ? const SizedBox(
                  width: 24,
                  height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                  ),
                )
              : Text(
                  _isLogin
                      ? (Provider.of<LocaleProvider>(context).isBangla
                          ? 'লগ ইন'
                          : 'Login')
                      : (Provider.of<LocaleProvider>(context).isBangla
                          ? 'অ্যাকাউন্ট তৈরি করুন'
                          : 'Create Account'),
                  style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
                ),
        );
      },
    );
  }

  Widget _buildDivider(bool isDark, AppLocalizations l10n) {
    return Row(
      children: [
        Expanded(
          child: Divider(
            color: isDark
                ? Colors.white.withValues(alpha: 0.1)
                : Colors.black.withValues(alpha: 0.1),
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(
            Provider.of<LocaleProvider>(context).isBangla ? 'অথবা' : 'OR',
            style: TextStyle(
              color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
            ),
          ),
        ),
        Expanded(
          child: Divider(
            color: isDark
                ? Colors.white.withValues(alpha: 0.1)
                : Colors.black.withValues(alpha: 0.1),
          ),
        ),
      ],
    );
  }

  Widget _buildGoogleButton(bool isDark, AppLocalizations l10n) {
    return Consumer<AuthProvider>(
      builder: (context, auth, child) {
        return OutlinedButton.icon(
          onPressed: auth.isLoading ? null : _handleGoogleSignIn,
          icon: Image.network(
            'https://www.google.com/favicon.ico',
            width: 20,
            height: 20,
            errorBuilder: (context, error, stack) =>
                const Icon(Icons.g_mobiledata, size: 24),
          ),
          label: Text(Provider.of<LocaleProvider>(context).isBangla
              ? 'গুগল দিয়ে লগ ইন করুন'
              : 'Login with Google'),
          style: OutlinedButton.styleFrom(
            foregroundColor: isDark ? Colors.white : Colors.black87,
            padding: const EdgeInsets.symmetric(vertical: 16),
            side: BorderSide(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.2)
                  : Colors.black.withValues(alpha: 0.2),
            ),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        );
      },
    );
  }

  Widget _buildToggle(bool isDark, AppLocalizations l10n) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          _isLogin
              ? (Provider.of<LocaleProvider>(context).isBangla
                  ? 'অ্যাকাউন্ট নেই?'
                  : 'Don\'t have an account?')
              : (Provider.of<LocaleProvider>(context).isBangla
                  ? 'ইতিমধ্যে অ্যাকাউন্ট আছে?'
                  : 'Already have an account?'),
          style: TextStyle(
            color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
          ),
        ),
        TextButton(
          onPressed: () => setState(() => _isLogin = !_isLogin),
          child: Text(
            _isLogin
                ? (Provider.of<LocaleProvider>(context).isBangla
                    ? 'নিবন্ধন করুন'
                    : 'Register')
                : (Provider.of<LocaleProvider>(context).isBangla
                    ? 'লগ ইন'
                    : 'Login'),
            style: const TextStyle(
              color: AppColors.primary,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildSkipButton(bool isDark, AppLocalizations l10n) {
    return TextButton(
      onPressed: () {
        Navigator.of(context).pushReplacementNamed('/home');
      },
      child: Text(
        Provider.of<LocaleProvider>(context).isBangla ? 'এড়িয়ে যান' : 'Skip',
        style: TextStyle(
          color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
        ),
      ),
    );
  }

  Widget _buildTermsCheckbox(bool isDark) {
    return Row(
      children: [
        SizedBox(
          height: 24,
          width: 24,
          child: Checkbox(
            value: _agreedToTerms,
            onChanged: (value) =>
                setState(() => _agreedToTerms = value ?? false),
            activeColor: AppColors.primary,
            side: BorderSide(
              color: isDark ? AppColors.textSubDark : AppColors.textSubLight,
              width: 2,
            ),
            shape:
                RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: GestureDetector(
            onTap: () => setState(() => _agreedToTerms = !_agreedToTerms),
            child: RichText(
              text: TextSpan(
                style: TextStyle(
                  color:
                      isDark ? AppColors.textSubDark : AppColors.textSubLight,
                  fontSize: 12,
                ),
                children: [
                  TextSpan(
                    text: Provider.of<LocaleProvider>(context).isBangla
                        ? 'সাইন আপ করে আপনি আমাদের '
                        : 'By signing up you agree to our ',
                  ),
                  WidgetSpan(
                    child: GestureDetector(
                      onTap: () {
                        Navigator.pushNamed(context, '/terms_and_conditions');
                      },
                      child: Text(
                        Provider.of<LocaleProvider>(context).isBangla
                            ? 'শর্তাবলী'
                            : 'Terms and Conditions',
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                  TextSpan(
                    text: Provider.of<LocaleProvider>(context).isBangla
                        ? ' এবং '
                        : ' and ',
                  ),
                  WidgetSpan(
                    child: GestureDetector(
                      onTap: () {
                        Navigator.pushNamed(context, '/privacy_policy');
                      },
                      child: Text(
                        Provider.of<LocaleProvider>(context).isBangla
                            ? 'গোপনীয়তা নীতি'
                            : 'Privacy Policy',
                        style: const TextStyle(
                          color: AppColors.primary,
                          fontWeight: FontWeight.bold,
                          fontSize: 12,
                        ),
                      ),
                    ),
                  ),
                  TextSpan(
                    text: Provider.of<LocaleProvider>(context).isBangla
                        ? ' এর সাথে একমত পোষণ করছেন'
                        : '',
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
