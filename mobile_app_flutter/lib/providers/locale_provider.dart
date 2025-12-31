import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Locale/Language Provider
/// Manages English/Bangla language switching with persistence
class LocaleProvider with ChangeNotifier {
  static const String _localeKey = 'app_locale';

  String _locale = 'bn'; // Default to Bangla
  bool _isInitialized = false;

  String get locale => _locale;
  bool get isBangla => _locale == 'bn';
  bool get isEnglish => _locale == 'en';
  bool get isInitialized => _isInitialized;

  /// Initialize and load saved preference
  Future<void> initialize() async {
    if (_isInitialized) return;

    try {
      final prefs = await SharedPreferences.getInstance();
      _locale = prefs.getString(_localeKey) ?? 'bn';
      _isInitialized = true;
      notifyListeners();
    } catch (e) {
      debugPrint('Failed to load locale preference: $e');
      _isInitialized = true;
    }
  }

  /// Switch to a specific language
  Future<void> setLocale(String locale) async {
    if (locale != 'en' && locale != 'bn') return;
    if (_locale == locale) return;

    _locale = locale;
    notifyListeners();

    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_localeKey, locale);
    } catch (e) {
      debugPrint('Failed to save locale preference: $e');
    }
  }

  /// Toggle between English and Bangla
  Future<void> toggleLocale() async {
    await setLocale(_locale == 'en' ? 'bn' : 'en');
  }
}
