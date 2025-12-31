import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';
import '../providers/locale_provider.dart';

/// App Localizations
/// Provides translated strings for English and Bangla
class AppLocalizations {
  final String locale;

  AppLocalizations(this.locale);

  /// Get the localizations from context
  static AppLocalizations of(BuildContext context) {
    final localeProvider = context.watch<LocaleProvider>();
    return AppLocalizations(localeProvider.locale);
  }

  /// Get without listening (for callbacks)
  static AppLocalizations read(BuildContext context) {
    final localeProvider = context.read<LocaleProvider>();
    return AppLocalizations(localeProvider.locale);
  }

  bool get isBangla => locale == 'bn';

  // ============ Common ============
  String get appName => isBangla ? 'TV ডাক্তার' : 'TV Daktar';
  String get loading => isBangla ? 'লোড হচ্ছে...' : 'Loading...';
  String get error => isBangla ? 'ত্রুটি' : 'Error';
  String get success => isBangla ? 'সফল' : 'Success';
  String get ok => isBangla ? 'ঠিক আছে' : 'OK';
  String get cancel => isBangla ? 'বাতিল' : 'Cancel';
  String get save => isBangla ? 'সেভ করুন' : 'Save';
  String get next => isBangla ? 'পরবর্তী' : 'Next';
  String get back => isBangla ? 'পিছনে' : 'Back';
  String get submit => isBangla ? 'জমা দিন' : 'Submit';
  String get yes => isBangla ? 'হ্যাঁ' : 'Yes';
  String get no => isBangla ? 'না' : 'No';

  // ============ Login Screen ============
  String get welcomeLogin =>
      isBangla ? 'স্বাগতম! লগইন করুন' : 'Welcome! Please Login';
  String get createNewAccount =>
      isBangla ? 'নতুন অ্যাকাউন্ট তৈরি করুন' : 'Create a New Account';
  String get yourName => isBangla ? 'আপনার নাম' : 'Your Name';
  String get enterYourName => isBangla ? 'আপনার নাম লিখুন' : 'Enter your name';
  String get mobileNumber => isBangla ? 'মোবাইল নম্বর' : 'Mobile Number';
  String get enterMobileNumber =>
      isBangla ? 'মোবাইল নম্বর লিখুন' : 'Enter mobile number';
  String get validMobileNumber =>
      isBangla ? 'সঠিক মোবাইল নম্বর লিখুন' : 'Enter a valid mobile number';
  String get emailOptional => isBangla ? 'ইমেইল (ঐচ্ছিক)' : 'Email (Optional)';
  String get addressOptional =>
      isBangla ? 'ঠিকানা (ঐচ্ছিক)' : 'Address (Optional)';
  String get password => isBangla ? 'পাসওয়ার্ড' : 'Password';
  String get enterPassword => isBangla ? 'পাসওয়ার্ড লিখুন' : 'Enter password';
  String get passwordMinLength => isBangla
      ? 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে'
      : 'Password must be at least 6 characters';
  String get login => isBangla ? 'লগইন' : 'Login';
  String get createAccount =>
      isBangla ? 'অ্যাকাউন্ট তৈরি করুন' : 'Create Account';
  String get or => isBangla ? 'অথবা' : 'or';
  String get loginWithGoogle =>
      isBangla ? 'Google দিয়ে লগইন' : 'Login with Google';
  String get noAccount =>
      isBangla ? 'অ্যাকাউন্ট নেই?' : 'Don\'t have an account?';
  String get alreadyHaveAccount =>
      isBangla ? 'ইতিমধ্যে অ্যাকাউন্ট আছে?' : 'Already have an account?';
  String get register => isBangla ? 'রেজিস্টার করুন' : 'Register';
  String get skip => isBangla ? 'এড়িয়ে যান' : 'Skip';

  // ============ Profile Screen ============
  String get profile => isBangla ? 'প্রোফাইল' : 'Profile';
  String get editProfile => isBangla ? 'প্রোফাইল সম্পাদনা' : 'Edit Profile';
  String get settings => isBangla ? 'সেটিংস' : 'Settings';
  String get language => isBangla ? 'ভাষা' : 'Language';
  String get theme => isBangla ? 'থিম' : 'Theme';
  String get darkMode => isBangla ? 'ডার্ক মোড' : 'Dark Mode';
  String get lightMode => isBangla ? 'লাইট মোড' : 'Light Mode';
  String get systemTheme => isBangla ? 'সিস্টেম থিম' : 'System Theme';
  String get notifications => isBangla ? 'নোটিফিকেশন' : 'Notifications';
  String get logout => isBangla ? 'লগআউট' : 'Logout';
  String get logoutConfirm =>
      isBangla ? 'আপনি কি লগআউট করতে চান?' : 'Do you want to logout?';
  String get loginToSeeProfile =>
      isBangla ? 'প্রোফাইল দেখতে লগইন করুন' : 'Login to see your profile';
  String get myOrders => isBangla ? 'আমার অর্ডার' : 'My Orders';
  String get myRepairs => isBangla ? 'আমার মেরামত' : 'My Repairs';
  String get helpSupport => isBangla ? 'সাহায্য ও সহায়তা' : 'Help & Support';
  String get aboutUs => isBangla ? 'আমাদের সম্পর্কে' : 'About Us';
  String get privacyPolicy => isBangla ? 'গোপনীয়তা নীতি' : 'Privacy Policy';
  String get termsConditions => isBangla ? 'শর্তাবলী' : 'Terms & Conditions';
  String get english => 'English';
  String get bangla => 'বাংলা';

  // ============ Repair Request Screen ============
  String get repairRequest => isBangla ? 'মেরামত অনুরোধ' : 'Repair Request';
  String get selectBrand =>
      isBangla ? 'ব্র্যান্ড নির্বাচন করুন' : 'Select Brand';
  String get selectScreenSize =>
      isBangla ? 'স্ক্রিন সাইজ নির্বাচন করুন' : 'Select Screen Size';
  String get modelNumberOptional =>
      isBangla ? 'মডেল নম্বর (ঐচ্ছিক)' : 'Model Number (Optional)';
  String get primaryIssue => isBangla ? 'প্রধান সমস্যা' : 'Primary Issue';
  String get commonSymptoms => isBangla ? 'সাধারণ লক্ষণ' : 'Common Symptoms';
  String get descriptionOptional =>
      isBangla ? 'বিবরণ (ঐচ্ছিক)' : 'Description (Optional)';
  String get serviceType => isBangla ? 'সার্ভিস ধরন' : 'Service Type';
  String get homePickup => isBangla ? 'হোম পিকআপ' : 'Home Pickup';
  String get visitCenter => isBangla ? 'সেন্টারে আসুন' : 'Visit Center';
  String get pickupAddress => isBangla ? 'পিকআপ ঠিকানা' : 'Pickup Address';
  String get selectDate => isBangla ? 'তারিখ নির্বাচন করুন' : 'Select Date';
  String get contactDetails => isBangla ? 'যোগাযোগের তথ্য' : 'Contact Details';
  String get fullName => isBangla ? 'পুরো নাম' : 'Full Name';
  String get phoneNumber => isBangla ? 'ফোন নম্বর' : 'Phone Number';
  String get reviewRequest => isBangla ? 'অনুরোধ পর্যালোচনা' : 'Review Request';
  String get submitRequest => isBangla ? 'অনুরোধ জমা দিন' : 'Submit Request';
  String get requestSubmitted =>
      isBangla ? 'অনুরোধ জমা হয়েছে' : 'Request Submitted';
  String get requestSubmittedMessage => isBangla
      ? 'আপনার মেরামত অনুরোধ সফলভাবে জমা হয়েছে। আমরা শীঘ্রই যোগাযোগ করব।'
      : 'Your repair request has been submitted successfully. We will contact you shortly.';

  // ============ Home Screen ============
  String get home => isBangla ? 'হোম' : 'Home';
  String get shop => isBangla ? 'শপ' : 'Shop';
  String get cart => isBangla ? 'কার্ট' : 'Cart';
  String get history => isBangla ? 'ইতিহাস' : 'History';

  // ============ Validation Messages ============
  String get pleaseSelectBrand => isBangla
      ? 'অনুগ্রহ করে ব্র্যান্ড নির্বাচন করুন'
      : 'Please select a brand';
  String get pleaseSelectScreenSize => isBangla
      ? 'অনুগ্রহ করে স্ক্রিন সাইজ নির্বাচন করুন'
      : 'Please select a screen size';
  String get pleaseSelectPrimaryIssue => isBangla
      ? 'অনুগ্রহ করে প্রধান সমস্যা নির্বাচন করুন'
      : 'Please select a primary issue';
  String get pleaseSelectSymptom => isBangla
      ? 'অনুগ্রহ করে অন্তত একটি লক্ষণ নির্বাচন করুন'
      : 'Please select at least one symptom';
  String get pleaseEnterAddress =>
      isBangla ? 'অনুগ্রহ করে ঠিকানা লিখুন' : 'Please enter your address';
  String get pleaseSelectDate =>
      isBangla ? 'অনুগ্রহ করে তারিখ নির্বাচন করুন' : 'Please select a date';
  String get pleaseEnterName =>
      isBangla ? 'অনুগ্রহ করে নাম লিখুন' : 'Please enter your name';
  String get pleaseEnterPhone => isBangla
      ? 'অনুগ্রহ করে ফোন নম্বর লিখুন'
      : 'Please enter your phone number';
  String get validPhoneNumber => isBangla
      ? 'অনুগ্রহ করে সঠিক ১০ সংখ্যার ফোন নম্বর লিখুন'
      : 'Please enter a valid 10-digit phone number';
  String get passwordMinLengthError => isBangla
      ? 'পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে'
      : 'Password must be at least 6 characters';
  String get passwordsDoNotMatch =>
      isBangla ? 'পাসওয়ার্ড মিলছে না' : 'Passwords do not match';
}
